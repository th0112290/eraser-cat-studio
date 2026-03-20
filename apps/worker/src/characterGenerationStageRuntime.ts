// @ts-nocheck

export function initializeGenerationStageRuntime(input: any) {
  const {
    runtimeState,
    resolveStageConfig,
    autoRetryRounds,
    clamped,
    limits,
    promptBundle,
    ultraWorkflowEnabled,
    analyzeImage,
    buildStructureControlsByViewForStage,
    buildStageInputPreflightAssessment,
    clampStageCandidateCount,
    writeGenerationProgress,
    helpers,
    jobDbId,
    hasRetryAdjustmentContent,
    summarizeStageBestCandidateByView,
    summarizeObservedDefectFamiliesByView,
    summarizeStageExitByView,
    dedupeStrings,
    buildPreflightBlockedStageOutcomeSummaries,
    generation,
    mergeRetryAdjustments,
    appendPromptHints,
    strengthenNegativePrompt,
    stageRequiresPoseGuide,
    resolveProviderStageTimeoutMs,
    runProviderGenerate,
    summarizeRetryGateDiagnosticsByView,
    summarizeBestScores,
    loadMascotFamilyReferenceCached,
    isMascotTargetStyle,
    withAsyncOperationTimeout,
    postprocessCandidateForProduction,
    scoreCandidate,
    styleScore,
    referenceAnalysis,
    safeFileName,
    fs,
    path,
    candidatesDir,
    materializeCandidateProviderArtifacts,
    collectRuntimeVariantTags,
    applyConsistencyScoring,
    groupBestByView,
    isStrongFrontMasterCandidate,
    hasBlockingConsistencyRecoveryIssue,
    deriveRetryAdjustmentForCandidate,
    adjustReferenceBankWeights,
    rebalanceReferenceBankForRetry,
    referenceBankHasHeroRole,
    resolveStageControlPresetId,
    mascotReferenceBankDiagnostics,
    providerRequestTimeoutMs,
    providerStageTimeoutOverrideMs,
    candidatePostprocessTimeoutMs,
    candidateAnalysisTimeoutMs,
    referenceImageBase64,
    referenceMimeType,
    resolveFrontReferenceFromManifest,
    sessionId,
    resolveFrontReferenceFromSession,
    prisma,
    continuityConfig,
    loadStagePoseGuides,
    inlineReferenceFromCandidate,
    buildRepairDirectiveProfile,
    summarizeRepairDirectiveProfile,
    buildMascotFamilyReferenceEntries,
    shouldEnableMascotHeroMode,
    createReferenceBankEntry,
    resolveAdaptiveReferenceWeight,
    mascotFamilyReferencesByView,
    acceptedScoreThreshold,
    dedupeReferenceBank,
    resolveEffectiveStageTriggerThreshold,
    shouldRunSideRefineForCandidate,
    shouldRunIdentityLockForCandidate,
    selectBestCandidateForViewByStages,
    mergeStageViewOutcomeSummaries,
    selectRetryInlineReferenceInput,
    summarizeReferenceMixByView
  } = input;
  const runViewGeneration = async (input: {
    views: CharacterView[];
    stage: GenerationStageKey;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    referenceInput?: InlineImageReference;
    referenceInputByView?: Partial<Record<CharacterView, InlineImageReference>>;
    repairMaskByView?: Partial<Record<CharacterView, InlineImageReference>>;
    referenceBank?: CharacterReferenceBankEntry[];
    referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
    poseGuidesByView?: Partial<Record<CharacterView, InlineImageReference>>;
    baseAdjustmentsByView?: Partial<Record<CharacterView, RetryAdjustment>>;
    directiveProfilesByView?: Partial<Record<CharacterView, RepairDirectiveProfileSummary>>;
    candidateCountOverride?: number;
    acceptedScoreThresholdOverride?: number;
    budgetViewCount?: number;
    repairFromCandidateIds?: Partial<Record<CharacterView, string>>;
    repairLineageByView?: Partial<Record<CharacterView, CharacterRepairLineage>>;
    seedOffset?: number;
  }): Promise<void> => {
    let providerWarning = runtimeState.providerWarning;
    const stageConfig = resolveStageConfig(input.stage);
    const stageProgress =
      input.stage === "front"
        ? { start: 12, end: 36 }
        : input.stage === "refine"
          ? { start: 68, end: 79 }
        : input.stage === "lock"
          ? { start: 79, end: 84 }
        : input.stage === "repair"
          ? { start: 84, end: 92 }
        : input.stage === "angles"
          ? { start: 44, end: 78 }
          : { start: 44, end: 78 };
    const inFlightStageProgressCeiling = Math.max(stageProgress.start, stageProgress.end - 1);
    const resolveInFlightStageProgress = (completedRounds: number): number => {
      const totalRounds = Math.max(1, autoRetryRounds + 1);
      const span = Math.max(1, inFlightStageProgressCeiling - stageProgress.start);
      const normalizedCompletedRounds = Math.min(totalRounds, Math.max(0, completedRounds));
      if (normalizedCompletedRounds <= 0) {
        return stageProgress.start;
      }
      const stepped = stageProgress.start + Math.floor((span * normalizedCompletedRounds) / totalRounds);
      return Math.max(stageProgress.start, Math.min(inFlightStageProgressCeiling, stepped));
    };
    const stageCandidatePlan = clampStageCandidateCount(
      input.candidateCountOverride ?? clamped.candidateCount,
      input.budgetViewCount ?? input.views.length,
      limits
    );
    if (stageCandidatePlan.warnings.length > 0) {
      const stageWarning = `${input.stage} candidate plan: ${stageCandidatePlan.warnings.join(" / ")}`;
      providerWarning = providerWarning ? `${providerWarning} | ${stageWarning}` : stageWarning;
    }

    const stageAcceptedScoreThreshold = Math.max(0, input.acceptedScoreThresholdOverride ?? acceptedScoreThreshold);
    const referenceAnalysisByView: Partial<Record<CharacterView, ImageAnalysis>> = {};
    for (const view of input.views) {
      const perViewReference = input.referenceInputByView?.[view];
      if (perViewReference?.referenceImageBase64) {
        try {
          referenceAnalysisByView[view] = await analyzeImage(
            Buffer.from(perViewReference.referenceImageBase64, "base64")
          );
          continue;
        } catch {
          // Ignore bad per-view references and continue with fallback analysis.
        }
      }

      if (isMascotTargetStyle(promptBundle.qualityProfile.targetStyle)) {
        const familyReference = loadMascotFamilyReferenceCached(promptBundle.speciesId, view);
        if (familyReference) {
          try {
            referenceAnalysisByView[view] = await analyzeImage(
              Buffer.from(familyReference.referenceImageBase64, "base64")
            );
          } catch {
            // Ignore unreadable family references.
          }
        }
      }
    }
    const structureControlsByView = ultraWorkflowEnabled
      ? await buildStructureControlsByViewForStage({
          stage: input.stage,
          views: input.views,
          referenceBank: input.referenceBank,
          referenceBankByView: input.referenceBankByView
        })
      : {};
    const structureControlKindsByView =
      Object.keys(structureControlsByView).length > 0
        ? Object.fromEntries(
            Object.entries(structureControlsByView).map(([view, controls]) => [view, Object.keys(controls ?? {}).sort()])
          )
        : undefined;
    const preflightAssessment = ultraWorkflowEnabled
      ? await buildStageInputPreflightAssessment({
          stage: input.stage,
          views: input.views,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          referenceBank: input.referenceBank,
          referenceBankByView: input.referenceBankByView,
          referenceAnalysisByView,
          structureControlsByView
        })
      : {
          status: "ok" as const,
          executionViews: [...input.views],
          blockedViews: [],
          warningViews: [],
          diagnosticsByView: {},
          summary: "preflight skipped"
        };
    const executionViews = preflightAssessment.executionViews;
    const stageRuntimeVariantTags = new Set<string>();
    if (preflightAssessment.status === "review") {
      stageRuntimeVariantTags.add("preflight:review");
    } else if (preflightAssessment.status === "block") {
      stageRuntimeVariantTags.add("preflight:block");
    }
    for (const view of preflightAssessment.blockedViews) {
      stageRuntimeVariantTags.add(`preflight:block:${view}`);
      const diagnostics = preflightAssessment.diagnosticsByView[view];
      if ((diagnostics?.reasonCodes ?? []).some((reason) => reason.includes("structure_source"))) {
        stageRuntimeVariantTags.add(`preflight:source:block:${view}`);
      }
    }
    for (const view of preflightAssessment.warningViews) {
      stageRuntimeVariantTags.add(`preflight:review:${view}`);
      const diagnostics = preflightAssessment.diagnosticsByView[view];
      if ((diagnostics?.reasonCodes ?? []).some((reason) => reason.includes("structure_source"))) {
        stageRuntimeVariantTags.add(`preflight:source:review:${view}`);
      }
    }
    const writeStageRetryProgress = async (inputProgress: {
      completedRounds: number;
      phase: string;
      belowThresholdViews?: CharacterView[];
      retryAdjustments?: Partial<Record<CharacterView, string[]>>;
      gateDiagnosticsByView?: ReturnType<typeof summarizeRetryGateDiagnosticsByView>;
      bestScores?: ReturnType<typeof summarizeBestScores>;
    }): Promise<void> => {
      await writeGenerationProgress(resolveInFlightStageProgress(inputProgress.completedRounds), `${input.stage}_${inputProgress.phase}`, {
        views: input.views,
        executionViews,
        workflowStage: stageConfig.workflowStage,
        workflowTemplateVersion: stageConfig.templateVersion,
        origin: input.origin,
        passLabel: input.passLabel,
        reasonCodes: input.reasonCodes,
        triggerViews: input.triggerViews,
        roundsCompleted: inputProgress.completedRounds,
        totalRounds: Math.max(1, autoRetryRounds + 1),
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        candidateCount: stageCandidatePlan.candidateCount,
        ...(inputProgress.belowThresholdViews && inputProgress.belowThresholdViews.length > 0
          ? { belowThresholdViews: inputProgress.belowThresholdViews }
          : {}),
        ...(inputProgress.retryAdjustments && Object.keys(inputProgress.retryAdjustments).length > 0
          ? { retryAdjustments: inputProgress.retryAdjustments }
          : {}),
        ...(inputProgress.gateDiagnosticsByView && Object.keys(inputProgress.gateDiagnosticsByView).length > 0
          ? { gateDiagnosticsByView: inputProgress.gateDiagnosticsByView }
          : {}),
        ...(inputProgress.bestScores && Object.keys(inputProgress.bestScores).length > 0
          ? { bestScores: inputProgress.bestScores }
          : {})
      });
    };
    if (preflightAssessment.status !== "ok") {
      const stageWarning = `${input.stage} preflight: ${preflightAssessment.summary}`;
      providerWarning = providerWarning ? `${providerWarning} | ${stageWarning}` : stageWarning;
    }
    await helpers.logJob(jobDbId, "info", "Character generation stage started", {
      stage: input.stage,
      workflowStage: stageConfig.workflowStage,
      workflowTemplateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      views: input.views,
      executionViews,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      budgetViewCount: input.budgetViewCount ?? input.views.length,
      hasReference: Boolean(input.referenceInput),
      referenceBankSize:
        Array.isArray(input.referenceBank) ? input.referenceBank.length : undefined,
      referenceBankSizeByView:
        input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
          ? Object.fromEntries(
              Object.entries(input.referenceBankByView).map(([view, bank]) => [view, bank?.length ?? 0])
            )
          : undefined,
      baseAdjustmentNotes:
        input.baseAdjustmentsByView && Object.keys(input.baseAdjustmentsByView).length > 0
          ? Object.fromEntries(
              Object.entries(input.baseAdjustmentsByView)
                .filter(([, adjustment]) => hasRetryAdjustmentContent(adjustment))
                .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
            )
          : undefined,
      directiveProfilesByView:
        input.directiveProfilesByView && Object.keys(input.directiveProfilesByView).length > 0
          ? input.directiveProfilesByView
          : undefined,
      repairLineageByView:
        input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
          ? input.repairLineageByView
          : undefined,
      poseViews: Object.keys(input.poseGuidesByView ?? {}),
      structureControlKindsByView,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      seedOffset: input.seedOffset ?? 0
    });
    await writeGenerationProgress(stageProgress.start, `${input.stage}_started`, {
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      hasReference: Boolean(input.referenceInput),
      workflowStage: stageConfig.workflowStage,
      workflowTemplateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      repairLineageByView:
        input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
          ? input.repairLineageByView
          : undefined,
      poseViews: Object.keys(input.poseGuidesByView ?? {}),
      structureControlKindsByView,
      executionViews,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      seedOffset: input.seedOffset ?? 0
    });
    if (executionViews.length === 0) {
      const preflightStageSummaries = buildPreflightBlockedStageOutcomeSummaries(preflightAssessment);
      const stageExitSummary = summarizeStageExitByView(preflightStageSummaries);
      await helpers.logJob(jobDbId, "warn", "Character generation stage skipped by preflight", {
        stage: input.stage,
        views: input.views,
        executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        preflightByView: preflightAssessment.diagnosticsByView,
        runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)),
        ...stageExitSummary
      });
      workflowStageRuns.push({
        stage: stageConfig.workflowStage,
        templateVersion: stageConfig.templateVersion,
        templateSpecPath: stageConfig.templateSpecPath,
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.passLabel ? { passLabel: input.passLabel } : {}),
        ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0 ? { reasonCodes: input.reasonCodes } : {}),
        ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0 ? { triggerViews: input.triggerViews } : {}),
        ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
        views: input.views,
        executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        roundsAttempted: 0,
        ...(Object.keys(preflightAssessment.diagnosticsByView).length > 0
          ? { preflightByView: preflightAssessment.diagnosticsByView }
          : {}),
        ...(preflightAssessment.blockedViews.length > 0
          ? { blockedViewsByPreflight: preflightAssessment.blockedViews }
          : {}),
        ...(preflightAssessment.warningViews.length > 0
          ? { warningViewsByPreflight: preflightAssessment.warningViews }
          : {}),
        ...stageExitSummary,
        ...(stageRuntimeVariantTags.size > 0
          ? {
              runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right))
            }
          : {}),
        ...(preflightStageSummaries ? { bestCandidateSummaryByView: preflightStageSummaries } : {})
      });
      return;
    }
    const baseSeed = generation.seed ?? 101;
    const stageSeedOffset =
      input.stage === "front"
        ? 113
        : input.stage === "angles"
          ? 271
          : input.stage === "refine"
            ? 433
            : input.stage === "lock"
              ? 491
            : input.stage === "repair"
              ? 557
              : 419;
    let roundsAttempted = 0;
    let retryAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    let latestReferenceMixByView: Partial<Record<CharacterView, StageRunReferenceMixSummary>> | undefined;
    for (let round = 0; round <= autoRetryRounds; round += 1) {
      roundsAttempted = round + 1;
      const roundSeed = baseSeed + stageSeedOffset + (input.seedOffset ?? 0) + round * 1009 + executionViews.length * 41;
      const activeRetryAdjustments = Object.fromEntries(
        executionViews.flatMap((view) => {
          const mergedAdjustment = mergeRetryAdjustments(
            input.baseAdjustmentsByView?.[view],
            round > 0 ? retryAdjustmentsByView[view] : undefined
          );
          return mergedAdjustment ? [[view, mergedAdjustment]] : [];
        })
      ) as Partial<Record<CharacterView, RetryAdjustment>>;
      const retryNegativeTokens = [
        ...new Set(
          Object.values(activeRetryAdjustments).flatMap((adjustment) => adjustment?.extraNegativeTokens ?? [])
        )
      ];
      const roundNegativePrompt = appendPromptHints(
        promptBundle.negativePrompt,
        retryNegativeTokens
      );
      const strengthenedNegativePrompt = strengthenNegativePrompt(
        roundNegativePrompt,
        generation.boostNegativePrompt === true,
        round
      );
      const adjustedViewPrompts = Object.fromEntries(
        executionViews.map((view) => [
          view,
          appendPromptHints(
            promptBundle.viewPrompts[view],
            activeRetryAdjustments[view]?.viewPromptHints ?? []
          )
        ])
      ) as Record<CharacterView, string>;
      const poseRequiredForStage = stageRequiresPoseGuide(input.stage);
      const poseGuideBase64ByView = Object.fromEntries(
        Object.entries(input.poseGuidesByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .filter(
            ([view]) =>
              poseRequiredForStage || activeRetryAdjustments[view as CharacterView]?.disablePose !== true
          )
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const repairMaskBase64ByView = Object.fromEntries(
        Object.entries(input.repairMaskByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const repairMaskMimeTypeByView = Object.fromEntries(
        Object.entries(input.repairMaskByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const referenceBankByView = Object.fromEntries(
        Object.entries(input.referenceBankByView ?? {})
          .filter(([, bank]) => Array.isArray(bank) && bank.length > 0)
          .map(([view, bank]) => [
            view,
            dedupeReferenceBank(
              rebalanceReferenceBankForRetry({
                entries: adjustReferenceBankWeights(
                  bank ?? [],
                  activeRetryAdjustments[view as CharacterView]?.referenceWeightDeltas ?? {}
                ) ?? [],
                stage: input.stage,
                view: view as CharacterView,
                adjustment: activeRetryAdjustments[view as CharacterView]
              }) ?? []
            )
          ])
      ) as Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
      const adjustedReferenceBank = Array.isArray(input.referenceBank)
        ? dedupeReferenceBank(
            adjustReferenceBankWeights(
              input.referenceBank,
              Object.values(activeRetryAdjustments).reduce<Partial<Record<CharacterReferenceBankEntry["role"], number>>>(
                (acc, adjustment) => {
                  if (!adjustment) {
                    return acc;
                  }
                  for (const [role, delta] of Object.entries(adjustment.referenceWeightDeltas) as Array<
                    [CharacterReferenceBankEntry["role"], number]
                  >) {
                    acc[role] = Number(((acc[role] ?? 0) + delta).toFixed(3));
                  }
                  return acc;
                },
                {}
              )
            ) ?? []
          )
        : undefined;
      const effectiveReferenceInputByView = Object.fromEntries(
        executionViews.flatMap((view) => {
          const selectedReference = selectRetryInlineReferenceInput({
            view,
            speciesId: promptBundle.speciesId,
            explicitReference: input.referenceInputByView?.[view],
            enforceSideTurnBalance: activeRetryAdjustments[view]?.enforceSideTurnBalance,
            viewReferenceBank: referenceBankByView[view],
            adjustedReferenceBank,
            sharedReferenceInput:
              Object.keys(activeRetryAdjustments).length > 0 ? input.referenceInput : undefined
          });
          return selectedReference ? [[view, selectedReference]] : [];
        })
      ) as Partial<Record<CharacterView, InlineImageReference>>;
      const referenceBase64ByView = Object.fromEntries(
        Object.entries(effectiveReferenceInputByView)
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const referenceMimeTypeByView = Object.fromEntries(
        Object.entries(effectiveReferenceInputByView)
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const useSharedReferenceInput =
        Object.keys(activeRetryAdjustments).length === 0 || Object.keys(referenceBase64ByView).length === 0;
      latestReferenceMixByView = summarizeReferenceMixByView({
        views: executionViews,
        sharedReferenceBank: adjustedReferenceBank,
        referenceBankByView
      });
      const providerStageTimeoutMs = resolveProviderStageTimeoutMs({
        providerRequestTimeoutMs,
        providerStageTimeoutOverrideMs,
        executionViewCount: executionViews.length,
        candidateCount: stageCandidatePlan.candidateCount
      });
      const poseGuideMimeTypeByView = Object.fromEntries(
        Object.entries(input.poseGuidesByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .filter(
            ([view]) =>
              poseRequiredForStage || activeRetryAdjustments[view as CharacterView]?.disablePose !== true
          )
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const generatedCandidates = await withAsyncOperationTimeout(
        `character provider.generate stage=${input.stage} round=${round + 1} pass=${input.passLabel ?? input.origin ?? "direct"} views=${executionViews.join(",")}`,
        providerStageTimeoutMs,
        () => runProviderGenerate({
        mode: generation.mode,
        views: executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        baseSeed: roundSeed,
        speciesId: promptBundle.speciesId,
        presetId: promptBundle.presetId,
        positivePrompt: promptBundle.positivePrompt,
        negativePrompt: strengthenedNegativePrompt,
        guardrails: promptBundle.guardrails,
        qualityProfile: promptBundle.qualityProfile,
        viewPrompts: adjustedViewPrompts,
        selectionHints: promptBundle.selectionHints,
        ...(ultraWorkflowEnabled
          ? {
              workflowStage: stageConfig.workflowStage,
              workflowTemplateVersion: stageConfig.templateVersion,
              ...(input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
                ? {
                    repairLineageByView: input.repairLineageByView
                  }
                : {}),
              stagePlan: {
                stage: stageConfig.workflowStage,
                templateVersion: stageConfig.templateVersion,
                templateSpecPath: stageConfig.templateSpecPath,
                controlPresetId: resolveStageControlPresetId(input.stage, executionViews),
                ...(promptBundle.referenceBankId ? { referenceBankId: promptBundle.referenceBankId } : {}),
                referenceBankStatus: mascotReferenceBankDiagnostics.status,
                ...(mascotReferenceBankDiagnostics.missingRoles.length > 0
                  ? { referenceBankMissingRoles: mascotReferenceBankDiagnostics.missingRoles }
                  : {}),
                ...((promptBundle.mascotProfileId ?? promptBundle.speciesId)
                  ? { mascotProfileId: promptBundle.mascotProfileId ?? promptBundle.speciesId }
                  : {}),
                heroModeEnabled: referenceBankHasHeroRole({
                  sharedReferenceBank: adjustedReferenceBank,
                  referenceBankByView
                }),
                views: executionViews,
                candidateCount: stageCandidatePlan.candidateCount,
                acceptedScoreThreshold: stageAcceptedScoreThreshold,
                ...(input.origin ? { origin: input.origin } : {}),
                ...(input.passLabel ? { passLabel: input.passLabel } : {}),
                ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0
                  ? { reasonCodes: input.reasonCodes }
                  : {}),
                ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0
                  ? { triggerViews: input.triggerViews }
                  : {}),
                ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
                ...(structureControlKindsByView
                  ? {
                      structureControlKinds: [
                        ...new Set(
                          Object.values(structureControlKindsByView).flatMap((kinds) => kinds ?? [])
                        )
                      ] as CharacterStructureControlKind[]
                    }
                  : {}),
                ...(input.repairFromCandidateIds && Object.keys(input.repairFromCandidateIds).length > 0
                  ? {
                      repairFromCandidateId: Object.values(input.repairFromCandidateIds)[0]
                    }
                  : {}),
                ...(input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
                  ? Object.values(input.repairLineageByView)[0] ?? {}
                  : {}),
                referenceBankSize:
                  Array.isArray(input.referenceBank) && input.referenceBank.length > 0
                    ? input.referenceBank.length
                    : input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
                      ? Object.values(input.referenceBankByView).reduce(
                          (sum, bank) => sum + (Array.isArray(bank) ? bank.length : 0),
                          0
                        )
                    : undefined
              }
            }
          : {}),
        ...(useSharedReferenceInput || Object.keys(referenceBase64ByView).length > 0
          ? { referenceMode: "img2img" as const }
          : {}),
        ...(useSharedReferenceInput && input.referenceInput
          ? {
              referenceImageBase64: input.referenceInput.referenceImageBase64,
              referenceMimeType: input.referenceInput.referenceMimeType ?? "image/png"
            }
          : {}),
        ...(Array.isArray(adjustedReferenceBank) && adjustedReferenceBank.length > 0
          ? {
              referenceBank: adjustedReferenceBank
            }
          : {}),
        ...(Object.keys(referenceBase64ByView).length > 0
          ? {
              referenceImageBase64ByView: referenceBase64ByView,
              referenceMimeTypeByView
            }
          : {}),
        ...(Object.keys(repairMaskBase64ByView).length > 0
          ? {
              repairMaskImageBase64ByView: repairMaskBase64ByView,
              repairMaskMimeTypeByView
            }
          : {}),
        ...(Object.keys(referenceBankByView).length > 0
          ? {
              referenceBankByView
            }
          : {}),
        ...(Object.keys(poseGuideBase64ByView).length > 0
          ? {
              poseImageBase64ByView: poseGuideBase64ByView,
              poseMimeTypeByView: poseGuideMimeTypeByView
            }
          : {}),
        ...(Object.keys(structureControlsByView).length > 0
          ? {
              structureControlsByView
            }
          : {})
        })
      );

      for (const candidate of generatedCandidates) {
        if (!executionViews.includes(candidate.view)) {
          continue;
        }

        const postprocessedCandidate = await withAsyncOperationTimeout(
          `character postprocess stage=${input.stage} round=${round + 1} view=${candidate.view} candidate=${candidate.id}`,
          candidatePostprocessTimeoutMs,
          () =>
            postprocessCandidateForProduction({
              candidate,
              qualityProfile: promptBundle.qualityProfile
            })
        );
        const analysis = await withAsyncOperationTimeout(
          `character analyze stage=${input.stage} round=${round + 1} view=${postprocessedCandidate.view} candidate=${postprocessedCandidate.id}`,
          candidateAnalysisTimeoutMs,
          () => analyzeImage(postprocessedCandidate.data)
        );
        const scoredCandidate = scoreCandidate({
          candidate: postprocessedCandidate,
          analysis,
          mode: generation.mode,
          styleScore,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          speciesId: promptBundle.speciesId,
          generationRound: round,
          ...(referenceAnalysisByView[postprocessedCandidate.view] || referenceAnalysis
            ? {
                referenceAnalysis:
                  referenceAnalysisByView[postprocessedCandidate.view] ?? referenceAnalysis
              }
            : {})
        });

        const extension = postprocessedCandidate.mimeType.includes("svg") ? "svg" : "png";
        const fileStem = `${input.stage}_${postprocessedCandidate.view}_r${round}_${safeFileName(postprocessedCandidate.id)}_${postprocessedCandidate.candidateIndex}`;
        const outputPath = path.join(
          candidatesDir,
          `${fileStem}.${extension}`
        );
        fs.writeFileSync(outputPath, postprocessedCandidate.data);

        (scoredCandidate.candidate.providerMeta ??= {}).localCandidatePath = outputPath;
        const providerMetaWithArtifacts = materializeCandidateProviderArtifacts({
          candidate: scoredCandidate.candidate,
          candidatesDir,
          fileStem
        });
        if (providerMetaWithArtifacts) {
          scoredCandidate.candidate.providerMeta = providerMetaWithArtifacts;
        }
        collectRuntimeVariantTags({
          current: stageRuntimeVariantTags,
          provider: scoredCandidate.candidate.provider,
          providerMeta: scoredCandidate.candidate.providerMeta
        });
        scored.push(scoredCandidate);
      }

      applyConsistencyScoring(
        scored,
        promptBundle.qualityProfile.targetStyle,
        promptBundle.speciesId,
        stageAcceptedScoreThreshold
      );
      const bestByViewNow = groupBestByView(scored);
      const belowThresholdViews = executionViews.filter((view) => {
        const candidate = bestByViewNow[view];
        if (!candidate) {
          return true;
        }
        if (
          view === "front" &&
          !isStrongFrontMasterCandidate(
            candidate,
            promptBundle.qualityProfile.targetStyle,
            stageAcceptedScoreThreshold,
            promptBundle.speciesId
          )
        ) {
          return true;
        }
        if (candidate.rejections.length > 0) {
          return true;
        }
        if (hasBlockingConsistencyRecoveryIssue(candidate, promptBundle.speciesId)) {
          return true;
        }
        return candidate.score < stageAcceptedScoreThreshold;
      });

      if (belowThresholdViews.length === 0) {
        break;
      }

      retryAdjustmentsByView = Object.fromEntries(
        belowThresholdViews.flatMap((view) => {
          const adjustment = deriveRetryAdjustmentForCandidate({
            stage: input.stage,
            view,
            candidate: bestByViewNow[view],
            speciesId: promptBundle.speciesId
          });
          return hasRetryAdjustmentContent(adjustment) ? [[view, adjustment]] : [];
        })
      ) as Partial<Record<CharacterView, RetryAdjustment>>;
      const nextRetryAdjustmentNotes = Object.fromEntries(
        Object.entries(retryAdjustmentsByView)
          .filter(([, adjustment]) => adjustment && adjustment.notes.length > 0)
          .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
      );
      const gateDiagnosticsByView = summarizeRetryGateDiagnosticsByView({
        views: belowThresholdViews,
        bestByView: bestByViewNow,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: stageAcceptedScoreThreshold,
        speciesId: promptBundle.speciesId
      });

      if (round < autoRetryRounds) {
        const retryMessage = `Auto-regenerate round ${round + 1} for ${belowThresholdViews.join(", ")}`;
        providerWarning = providerWarning ? `${providerWarning} | ${retryMessage}` : retryMessage;
        await helpers.logJob(jobDbId, "info", "Character generation retry queued", {
          stage: input.stage,
          round: round + 1,
          belowThresholdViews,
          acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
          retryAdjustments: nextRetryAdjustmentNotes,
          gateDiagnosticsByView,
          bestScores: summarizeBestScores(executionViews)
        });
        await writeStageRetryProgress({
          completedRounds: round + 1,
          phase: "retry_queued",
          belowThresholdViews,
          retryAdjustments: nextRetryAdjustmentNotes,
          gateDiagnosticsByView,
          bestScores: summarizeBestScores(executionViews)
        });
      }
    }

    const stageBestCandidateSummaryByView = mergeStageViewOutcomeSummaries(
      summarizeStageBestCandidateByView({
        views: executionViews,
        bestByView: groupBestByView(scored),
        acceptedScoreThreshold: stageAcceptedScoreThreshold,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        speciesId: promptBundle.speciesId
      }),
      buildPreflightBlockedStageOutcomeSummaries(preflightAssessment)
    );
    const stageObservedDefectFamiliesByView = summarizeObservedDefectFamiliesByView({
      views: executionViews,
      bestByView: groupBestByView(scored)
    });
    const stageExitSummary = summarizeStageExitByView(stageBestCandidateSummaryByView);
    await helpers.logJob(jobDbId, "info", "Character generation stage completed", {
      stage: input.stage,
      views: input.views,
      executionViews,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      totalScored: scored.length,
      bestScores: summarizeBestScores(input.views),
      seedOffset: input.seedOffset ?? 0,
      origin: input.origin,
      passLabel: input.passLabel,
      referenceMixByView: latestReferenceMixByView,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      runtimeVariantTags: stageRuntimeVariantTags.size > 0 ? [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)) : [],
      ...stageExitSummary
    });
    await writeGenerationProgress(stageProgress.end, `${input.stage}_completed`, {
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      totalScored: scored.length,
      bestScores: summarizeBestScores(input.views),
      seedOffset: input.seedOffset ?? 0,
      origin: input.origin,
      passLabel: input.passLabel,
      referenceMixByView: latestReferenceMixByView,
      executionViews,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      runtimeVariantTags: stageRuntimeVariantTags.size > 0 ? [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)) : [],
      ...stageExitSummary
    });
    workflowStageRuns.push({
      stage: stageConfig.workflowStage,
      templateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.passLabel ? { passLabel: input.passLabel } : {}),
      ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0
        ? { reasonCodes: input.reasonCodes }
        : {}),
      ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0
        ? { triggerViews: input.triggerViews }
        : {}),
      ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      roundsAttempted,
      ...(input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
        ? {
            referenceBankSizeByView: Object.fromEntries(
              Object.entries(input.referenceBankByView).map(([view, bank]) => [view, bank?.length ?? 0])
            ) as Partial<Record<CharacterView, number>>
          }
        : Array.isArray(input.referenceBank) && input.referenceBank.length > 0
          ? {
              referenceBankSizeByView: Object.fromEntries(
                input.views.map((view) => [view, input.referenceBank?.length ?? 0])
              ) as Partial<Record<CharacterView, number>>
            }
        : {}),
      ...(latestReferenceMixByView
        ? {
            referenceMixByView: latestReferenceMixByView
          }
        : {}),
      ...(Object.keys(preflightAssessment.diagnosticsByView).length > 0
        ? {
            preflightByView: preflightAssessment.diagnosticsByView
          }
        : {}),
      ...(preflightAssessment.executionViews.length !== input.views.length
        ? {
            executionViews
          }
        : {}),
      ...(preflightAssessment.blockedViews.length > 0
        ? {
            blockedViewsByPreflight: preflightAssessment.blockedViews
          }
        : {}),
      ...(preflightAssessment.warningViews.length > 0
        ? {
            warningViewsByPreflight: preflightAssessment.warningViews
          }
        : {}),
      ...(input.baseAdjustmentsByView && Object.keys(input.baseAdjustmentsByView).length > 0
        ? {
            adjustmentNotesByView: Object.fromEntries(
              Object.entries(input.baseAdjustmentsByView)
                .filter(([, adjustment]) => hasRetryAdjustmentContent(adjustment))
                .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
            ) as Partial<Record<CharacterView, string[]>>
          }
        : {}),
      ...(input.directiveProfilesByView && Object.keys(input.directiveProfilesByView).length > 0
        ? {
            directiveProfilesByView: input.directiveProfilesByView
          }
        : {}),
      ...(input.repairFromCandidateIds && Object.keys(input.repairFromCandidateIds).length > 0
        ? {
            repairFromCandidateIds: input.repairFromCandidateIds
          }
        : {}),
      ...(stageObservedDefectFamiliesByView
        ? {
            observedDefectFamiliesByView: stageObservedDefectFamiliesByView
          }
        : {}),
      ...stageExitSummary,
      ...(stageRuntimeVariantTags.size > 0
        ? {
            runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right))
          }
        : {}),
      ...(stageBestCandidateSummaryByView
        ? {
            bestCandidateSummaryByView: stageBestCandidateSummaryByView
          }
        : {})
    });
  };

  const maybeRunUltraSideRefineStage = async (input: {
    targetViews: CharacterView[];
    bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
    frontReferenceInput?: InlineImageReference;
    origin: CharacterWorkflowStageOrigin;
    passLabel: string;
    reasonCodes: string[];
    triggerViews: CharacterView[];
    seedOffset?: number;
    acceptedScoreThresholdBoost?: number;
    candidateCountBoost?: number;
  }): Promise<CharacterView[]> => {
    const refineTriggerThreshold = resolveEffectiveStageTriggerThreshold(
      acceptedScoreThreshold,
      input.acceptedScoreThresholdBoost
    );
    const candidateViews = dedupeCharacterViews(
      input.targetViews.filter((view) =>
        shouldRunSideRefineForCandidate({
          candidate: input.bestByView[view],
          view,
          acceptedScoreThreshold: refineTriggerThreshold
        })
      )
    );
    if (candidateViews.length === 0) {
      return [];
    }

    let frontReferenceInput = input.frontReferenceInput;
    if (!frontReferenceInput) {
      frontReferenceInput = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
    }
    if (!frontReferenceInput && sessionId) {
      frontReferenceInput = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
    }
    if (!frontReferenceInput && referenceImageBase64) {
      frontReferenceInput = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    if (!frontReferenceInput) {
      return [];
    }

    const refineViews = candidateViews;
    if (refineViews.length === 0) {
      return [];
    }
    const refineFrontAnchorScore = input.bestByView.front?.score;

    const filteredPoseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: refineViews
    });

    const refineReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    const refineReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const refineBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    const refineDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {};

    for (const view of refineViews) {
      const candidate = input.bestByView[view];
      if (!candidate) {
        continue;
      }

      const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);
      refineReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
      const refineDirective = buildRepairDirectiveProfile({
        stage: "refine",
        view,
        candidate,
        speciesId: promptBundle.speciesId
      });
      if (refineDirective?.adjustment && hasRetryAdjustmentContent(refineDirective.adjustment)) {
        refineBaseAdjustmentsByView[view] = refineDirective.adjustment;
      }
      if (refineDirective) {
        refineDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(refineDirective);
      }

      const familyReferenceEntries = buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "refine",
        targetView: view,
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(starterReference),
        directiveFamilies: refineDirective?.families,
        directiveSeverity: refineDirective?.severity,
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "refine",
          heroMode: promptBundle.heroMode,
          frontAnchorScore: refineFrontAnchorScore
        })
      });
      const hasFamilyCompositionEntry = familyReferenceEntries.some((entry) => entry.role === "composition");
      const draftCompositionWeight = Number(
        Math.max(
          0.24,
          resolveAdaptiveReferenceWeight({
            stage: "refine",
            role: "composition",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: refineDirective?.families,
            directiveSeverity: refineDirective?.severity
          }) - (hasFamilyCompositionEntry ? 0.24 : 0)
        ).toFixed(3)
      );
      const bank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${view}_refine_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "refine",
            role: "front_master",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: refineDirective?.families,
            directiveSeverity: refineDirective?.severity
          }),
          note: "side refine front anchor",
          image: frontReferenceInput
        })
      ];
      if (starterReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_refine_view_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "refine",
              role: "view_starter",
              targetView: view,
              hasStarter: true,
              directiveFamilies: refineDirective?.families,
              directiveSeverity: refineDirective?.severity
            }),
            note: starterReference.sourcePath,
            image: starterReference
          })
        );
      }
      bank.push(...familyReferenceEntries);
      bank.push(
        createReferenceBankEntry({
          id: `${candidate.candidate.id}_refine_composition`,
          role: "composition",
          view,
          weight: draftCompositionWeight,
          note: "current side draft img2img seed",
          image: inlineReferenceFromCandidate(candidate.candidate)
        })
      );
      refineReferenceBankByView[view] = dedupeReferenceBank(bank);
    }

    const resolvedRefineViews = Object.keys(refineReferenceInputByView) as CharacterView[];
    if (resolvedRefineViews.length === 0) {
      return [];
    }

    const refineCandidateCount = Math.max(
      2,
      Math.min(
        6,
        Math.floor(Math.max(2, clamped.candidateCount - 1) + (input.candidateCountBoost ?? 0)) +
          Math.max(
            0,
            ...resolvedRefineViews.map((view) => refineDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
          )
      )
    );
    const refineAcceptedScoreThreshold = Math.min(
      0.98,
      acceptedScoreThreshold +
        0.015 +
        (input.acceptedScoreThresholdBoost ?? 0) +
        Math.max(
          0,
          ...resolvedRefineViews.map(
            (view) => (refineDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0) * 0.5
          )
        )
    );
    await helpers.logJob(jobDbId, "info", "Running ultra side refine stage", {
      refineViews: resolvedRefineViews,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      refineTriggerThreshold: Number(refineTriggerThreshold.toFixed(4)),
      refineAcceptedScoreThreshold: Number(refineAcceptedScoreThreshold.toFixed(4)),
      refineCandidateCount,
      origin: input.origin,
      passLabel: input.passLabel,
      directives: refineDirectiveProfilesByView
    });
    await runViewGeneration({
      views: resolvedRefineViews,
      stage: "refine",
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      referenceInput: frontReferenceInput,
      referenceInputByView: refineReferenceInputByView,
      referenceBankByView: refineReferenceBankByView,
      ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {}),
      ...(Object.keys(refineBaseAdjustmentsByView).length > 0
        ? { baseAdjustmentsByView: refineBaseAdjustmentsByView }
        : {}),
      ...(Object.keys(refineDirectiveProfilesByView).length > 0
        ? { directiveProfilesByView: refineDirectiveProfilesByView }
        : {}),
      candidateCountOverride: refineCandidateCount,
      acceptedScoreThresholdOverride: refineAcceptedScoreThreshold,
      seedOffset: input.seedOffset
    });
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    return resolvedRefineViews;
  };

  const maybeRunUltraIdentityLockStage = async (input: {
    targetViews: CharacterView[];
    bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
    frontReferenceInput?: InlineImageReference;
    origin: CharacterWorkflowStageOrigin;
    passLabel: string;
    reasonCodes: string[];
    triggerViews: CharacterView[];
    seedOffset?: number;
    acceptedScoreThresholdBoost?: number;
    candidateCountBoost?: number;
  }): Promise<CharacterView[]> => {
    const lockTriggerThreshold = resolveEffectiveStageTriggerThreshold(
      acceptedScoreThreshold,
      input.acceptedScoreThresholdBoost
    );
    const candidateViews = dedupeCharacterViews(
      input.targetViews.filter((view) =>
        shouldRunIdentityLockForCandidate({
          candidate: input.bestByView[view],
          view,
          acceptedScoreThreshold: lockTriggerThreshold
        })
      )
    );
    if (candidateViews.length === 0) {
      return [];
    }

    let frontReferenceInput = input.frontReferenceInput;
    if (!frontReferenceInput) {
      frontReferenceInput = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
    }
    if (!frontReferenceInput && sessionId) {
      frontReferenceInput = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
    }
    if (!frontReferenceInput && referenceImageBase64) {
      frontReferenceInput = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    if (!frontReferenceInput) {
      return [];
    }

    const lockViews = candidateViews;
    if (lockViews.length === 0) {
      return [];
    }
    const lockFrontAnchorScore = input.bestByView.front?.score;

    const filteredPoseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: lockViews
    });

    const lockReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    const lockReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const lockBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    const lockDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {};

    for (const view of lockViews) {
      const candidate = input.bestByView[view];
      if (!candidate) {
        continue;
      }

      const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);
      lockReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
      const lockDirective = buildRepairDirectiveProfile({
        stage: "lock",
        view,
        candidate,
        speciesId: promptBundle.speciesId
      });
      if (lockDirective?.adjustment && hasRetryAdjustmentContent(lockDirective.adjustment)) {
        lockBaseAdjustmentsByView[view] = lockDirective.adjustment;
      }
      if (lockDirective) {
        lockDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(lockDirective);
      }

      const familyReferenceEntries = buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "lock",
        targetView: view,
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(starterReference),
        directiveFamilies: lockDirective?.families,
        directiveSeverity: lockDirective?.severity,
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "lock",
          heroMode: promptBundle.heroMode,
          frontAnchorScore: lockFrontAnchorScore
        })
      });
      const hasFamilyCompositionEntry = familyReferenceEntries.some((entry) => entry.role === "composition");
      const draftCompositionWeight = Number(
        Math.max(
          0.24,
          resolveAdaptiveReferenceWeight({
            stage: "lock",
            role: "composition",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: lockDirective?.families,
            directiveSeverity: lockDirective?.severity
          }) - (hasFamilyCompositionEntry ? 0.28 : 0)
        ).toFixed(3)
      );
      const bank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${view}_identity_lock_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "lock",
            role: "front_master",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: lockDirective?.families,
            directiveSeverity: lockDirective?.severity
          }),
          note: "identity lock front anchor",
          image: frontReferenceInput
        })
      ];
      if (starterReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_identity_lock_view_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "lock",
              role: "view_starter",
              targetView: view,
              hasStarter: true,
              directiveFamilies: lockDirective?.families,
              directiveSeverity: lockDirective?.severity
            }),
            note: starterReference.sourcePath,
            image: starterReference
          })
        );
      }
      bank.push(...familyReferenceEntries);
      bank.push(
        createReferenceBankEntry({
          id: `${candidate.candidate.id}_identity_lock_composition`,
          role: "composition",
          view,
          weight: draftCompositionWeight,
          note: "identity lock current draft img2img seed",
          image: inlineReferenceFromCandidate(candidate.candidate)
        })
      );
      lockReferenceBankByView[view] = dedupeReferenceBank(bank);
    }

    const resolvedLockViews = Object.keys(lockReferenceInputByView) as CharacterView[];
    if (resolvedLockViews.length === 0) {
      return [];
    }

    const lockCandidateCount = Math.max(
      2,
      Math.min(
        5,
        Math.floor(Math.max(2, clamped.candidateCount - 1) + (input.candidateCountBoost ?? 0)) +
          Math.max(
            0,
            ...resolvedLockViews.map((view) => lockDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
          )
      )
    );
    const lockAcceptedScoreThreshold = Math.min(
      0.985,
      acceptedScoreThreshold +
        0.025 +
        (input.acceptedScoreThresholdBoost ?? 0) +
        Math.max(
          0,
          ...resolvedLockViews.map(
            (view) => (lockDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0) * 0.6
          )
        )
    );
    await helpers.logJob(jobDbId, "info", "Running ultra identity lock stage", {
      lockViews: resolvedLockViews,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      lockTriggerThreshold: Number(lockTriggerThreshold.toFixed(4)),
      lockAcceptedScoreThreshold: Number(lockAcceptedScoreThreshold.toFixed(4)),
      lockCandidateCount,
      origin: input.origin,
      passLabel: input.passLabel,
      directives: lockDirectiveProfilesByView
    });
    await runViewGeneration({
      views: resolvedLockViews,
      stage: "lock",
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      referenceInput: frontReferenceInput,
      referenceInputByView: lockReferenceInputByView,
      referenceBankByView: lockReferenceBankByView,
      ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {}),
      ...(Object.keys(lockBaseAdjustmentsByView).length > 0
        ? { baseAdjustmentsByView: lockBaseAdjustmentsByView }
        : {}),
      ...(Object.keys(lockDirectiveProfilesByView).length > 0
        ? { directiveProfilesByView: lockDirectiveProfilesByView }
        : {}),
      candidateCountOverride: lockCandidateCount,
      acceptedScoreThresholdOverride: lockAcceptedScoreThreshold,
      seedOffset: input.seedOffset
    });
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    return resolvedLockViews;
  };


  return {
    runViewGeneration,
    maybeRunUltraSideRefineStage,
    maybeRunUltraIdentityLockStage
  };
}