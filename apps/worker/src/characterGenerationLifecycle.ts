// @ts-nocheck
export async function runGenerationLifecycle(input: any) {
  const {
    runtimeState,
    sequentialReferenceEnabled,
    generation,
    requestedViews,
    requestedBaseStage,
    requestedBasePassPrefix,
    clamped,
    acceptedScoreThreshold,
    frontAnchorAcceptedScoreThreshold,
    promptBundle,
    continuityReferenceSessionId,
    referenceImageBase64,
    referenceMimeType,
    loadMascotStarterReference,
    loadMascotFrontBootstrapReference,
    resolveAdaptiveReferenceWeight,
    buildMascotFamilyReferenceEntries,
    shouldEnableMascotHeroMode,
    createReferenceBankEntry,
    dedupeReferenceBank,
    runViewGeneration,
    applyConsistencyScoring,
    scored,
    groupBestByView,
    isStrongFrontMasterCandidate,
    ultraWorkflowEnabled,
    selectBestRepairBaseCandidate,
    buildRepairMaskReferenceForCandidate,
    buildRepairDirectiveProfile,
    summarizeRepairDirectiveProfile,
    inlineReferenceFromCandidate,
    resolveCandidateWorkflowStage,
    resolveCandidatePassLabel,
    dedupeStrings,
    helpers,
    jobDbId,
    loadStagePoseGuides,
    buildPreferredSideReferenceInputByView,
    excludePoseGuidesCoveredByStarter,
    loadMascotStarterReferencesByView,
    mascotFamilyReferencesByView,
    shouldSuppressDuplicateViewStarterReference,
    hasRetryAdjustmentContent,
    buildInitialAngleReferenceBiasAdjustment,
    generationViewToGenerate,
    maybeRunUltraSideRefineStage,
    maybeRunUltraIdentityLockStage,
    buildSideViewAcceptanceGate,
    recordSideViewAcceptanceGateStage,
    buildPackCoherenceDiagnostics,
    assessRigStability,
    buildRepairTriageGate,
    applyRepairEmbargoDecisions,
    recordRepairTriageGateStage,
    buildPostRepairAcceptanceGate,
    recordPostRepairAcceptanceGateStage,
    selectBestCandidateForViewByStages,
    mergePreferredSelectionByViewForSelection,
    groupBestByViewForSelection,
    isRuntimeBucketLowQuality,
    isRepairEmbargoedSelection,
    allowLowQualityMockFallback,
    createCharacterProvider,
    runSelectionAutoRerouteFlow,
    autoRerouteConfig,
    continuitySnapshot,
    decideAutoReroute,
    dedupeCharacterViews,
    buildAutoRerouteViewDelta,
    toFlatContinuityFields,
    prisma,
    sessionId,
    payloadEpisodeId,
    providerCallLogs,
    writeGenerationProgress,
    summarizeBestScores,
    upsertSessionCandidates,
    insertProviderCallLogs
  } = input;
  let providerName = runtimeState.providerName;
  let providerWarning = runtimeState.providerWarning;
  let provider = runtimeState.provider;
  let starterReferencePathsByView = runtimeState.starterReferencePathsByView;
  let preferredSelectionByView = runtimeState.preferredSelectionByView;
  let autoRerouteDiagnostics = runtimeState.autoRerouteDiagnostics;
  const syncRuntimeState = () => {
    providerName = runtimeState.providerName;
    providerWarning = runtimeState.providerWarning;
    provider = runtimeState.provider;
    starterReferencePathsByView = runtimeState.starterReferencePathsByView;
    preferredSelectionByView = runtimeState.preferredSelectionByView;
    autoRerouteDiagnostics = runtimeState.autoRerouteDiagnostics;
  };
  const flushRuntimeState = () => {
    runtimeState.providerName = providerName;
    runtimeState.providerWarning = providerWarning;
    runtimeState.provider = provider;
    runtimeState.starterReferencePathsByView = starterReferencePathsByView;
    runtimeState.preferredSelectionByView = preferredSelectionByView;
    runtimeState.autoRerouteDiagnostics = autoRerouteDiagnostics;
  };
  const supportsReferenceSequential =
    sequentialReferenceEnabled &&
    providerName !== "mock" &&
    generation.viewToGenerate === undefined &&
    requestedViews.length > 1;

  if (supportsReferenceSequential && requestedViews.includes("front")) {
    const frontMasterCandidateCount = Math.max(
      clamped.candidateCount,
      Math.floor(promptBundle.selectionHints.frontMasterCandidateCount ?? clamped.candidateCount)
    );
    const frontReferenceBank: CharacterReferenceBankEntry[] = [];
    // Dog and wolf still need a stronger front bootstrap to keep species identity readable
    // while staying on the worker's actual front_master -> side_view_* -> repair chain.
    const frontStarterReference = referenceImageBase64
      ? loadMascotStarterReference(promptBundle.speciesId, "front")
      : loadMascotFrontBootstrapReference(promptBundle.speciesId);
    const frontReferenceInput =
      typeof referenceImageBase64 === "string" && referenceImageBase64.length > 0
        ? {
            referenceImageBase64,
            referenceMimeType
          }
        : frontStarterReference
          ? {
              referenceImageBase64: frontStarterReference.referenceImageBase64,
              referenceMimeType: frontStarterReference.referenceMimeType
            }
          : undefined;
    if (referenceImageBase64) {
      frontReferenceBank.push(
        createReferenceBankEntry({
          id: "external_subject_reference",
          role: "subject",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "subject",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "user or continuity reference",
          image: {
            referenceImageBase64,
            referenceMimeType
          }
        })
      );
    }
    if (frontStarterReference) {
      frontReferenceBank.push(
        createReferenceBankEntry({
          id: "front_starter_reference",
          role: "starter",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "starter",
            targetView: "front",
            hasStarter: true
          }),
          note: frontStarterReference.sourcePath,
          image: frontStarterReference
        })
      );
    }
    frontReferenceBank.push(
      ...buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "front",
        targetView: "front",
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(frontStarterReference),
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "front",
          heroMode: promptBundle.heroMode
        })
      })
    );
    flushRuntimeState();
      await runViewGeneration({
      views: ["front"],
      stage: "front",
      origin: "initial",
      passLabel: "front.initial",
      reasonCodes: ["sequential_front_anchor"],
      triggerViews: ["front"],
      candidateCountOverride: frontMasterCandidateCount,
      acceptedScoreThresholdOverride:
        typeof promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
          ? promptBundle.selectionHints.frontMasterMinAcceptedScore
          : acceptedScoreThreshold,
      budgetViewCount: requestedViews.length,
      ...(frontReferenceInput ? { referenceInput: frontReferenceInput } : {}),
      ...(frontReferenceBank.length > 0 ? { referenceBank: dedupeReferenceBank(frontReferenceBank) } : {})
    });
      syncRuntimeState();

    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    const bestAfterFront = groupBestByView(scored);
    let frontBaselineCandidate = bestAfterFront.front;
    const frontAnchorMinScore =
      typeof promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
        ? promptBundle.selectionHints.frontMasterMinAcceptedScore
        : acceptedScoreThreshold;
    let frontBaseline = isStrongFrontMasterCandidate(
      frontBaselineCandidate,
      promptBundle.qualityProfile.targetStyle,
      frontAnchorMinScore,
      promptBundle.speciesId
    )
      ? frontBaselineCandidate
      : undefined;
    const frontRescueCandidate =
      ultraWorkflowEnabled && frontBaselineCandidate && !frontBaseline
        ? selectBestRepairBaseCandidate({
            scored,
            view: "front",
            targetStyle: promptBundle.qualityProfile.targetStyle,
            acceptedScoreThreshold: frontAnchorMinScore
          })
        : undefined;
    if (frontRescueCandidate && !frontBaseline) {
      const frontRescueBank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_base`,
          role: "repair_base",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "repair_base",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue repair base",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        }),
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "front_master",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue provisional identity anchor",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        }),
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_composition`,
          role: "composition",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "composition",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue current draft composition",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        })
      ];
      if (referenceImageBase64) {
        frontRescueBank.push(
          createReferenceBankEntry({
            id: "front_rescue_subject_reference",
            role: "subject",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "subject",
              targetView: "front",
              hasStarter: Boolean(frontStarterReference)
            }),
            note: "shared rescue identity reference",
            image: {
              referenceImageBase64,
              referenceMimeType
            }
          })
        );
      }
      if (frontStarterReference) {
        frontRescueBank.push(
          createReferenceBankEntry({
            id: "front_rescue_starter_reference",
            role: "starter",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "starter",
              targetView: "front",
              hasStarter: true
            }),
            note: frontStarterReference.sourcePath,
            image: frontStarterReference
          })
        );
      }
      frontRescueBank.push(
        ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: "repair",
          targetView: "front",
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: Boolean(frontStarterReference),
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: shouldEnableMascotHeroMode({
            stage: "repair",
            heroMode: promptBundle.heroMode,
            frontAnchorScore: frontBaselineCandidate?.score
          })
        })
      );
      const frontRescueMask = await buildRepairMaskReferenceForCandidate(frontRescueCandidate);
      const frontRescueDirective = buildRepairDirectiveProfile({
        stage: "repair",
        view: "front",
        candidate: frontRescueCandidate,
        speciesId: promptBundle.speciesId
      });
      syncRuntimeState();
      const frontRescueAdjustment = frontRescueDirective?.adjustment;
      const frontRescueCandidateCount = Math.max(
        1,
        Math.floor(
          (promptBundle.selectionHints.repairCandidateCount ?? 2) + (frontRescueDirective?.candidateCountBoost ?? 0)
        )
      );
      const frontRescueAcceptedThreshold = Math.min(
        0.98,
        frontAnchorMinScore + (frontRescueDirective?.acceptedScoreThresholdBoost ?? 0)
      );
      await helpers.logJob(jobDbId, "info", "Running front rescue before angle generation", {
        frontCandidateId: frontRescueCandidate.candidate.id,
        frontCandidateScore: Number(frontRescueCandidate.score.toFixed(4)),
        frontAnchorMinScore: Number(frontAnchorMinScore.toFixed(4)),
        rescueDirective: frontRescueDirective ? summarizeRepairDirectiveProfile(frontRescueDirective) : null
      });
      syncRuntimeState();
      flushRuntimeState();
      await runViewGeneration({
        views: ["front"],
        stage: "repair",
        origin: "front_rescue",
        passLabel: "front.rescue",
        reasonCodes: ["weak_front_anchor", "repair_refine"],
        triggerViews: ["front"],
        candidateCountOverride: frontRescueCandidateCount,
        acceptedScoreThresholdOverride: frontRescueAcceptedThreshold,
        referenceInputByView: {
          front: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        },
        repairMaskByView: {
          front: frontRescueMask
        },
        referenceBankByView: {
          front: dedupeReferenceBank(frontRescueBank)
        },
        ...(hasRetryAdjustmentContent(frontRescueAdjustment)
          ? {
              baseAdjustmentsByView: {
                front: frontRescueAdjustment
              }
            }
          : {}),
        ...(frontRescueDirective
          ? {
              directiveProfilesByView: {
                front: summarizeRepairDirectiveProfile(frontRescueDirective)
              }
            }
          : {}),
        repairFromCandidateIds: {
          front: frontRescueCandidate.candidate.id
        },
        repairLineageByView: {
          front: {
            repairFromCandidateId: frontRescueCandidate.candidate.id,
            ...(resolveCandidateWorkflowStage(frontRescueCandidate)
              ? { repairFromStage: resolveCandidateWorkflowStage(frontRescueCandidate) }
              : {}),
            ...(resolveCandidatePassLabel(frontRescueCandidate)
              ? { sourcePassLabel: resolveCandidatePassLabel(frontRescueCandidate) }
              : {}),
            referenceLineage: dedupeStrings(
              [
                resolveCandidateWorkflowStage(frontRescueCandidate),
                frontRescueDirective?.severity ? `directive:${frontRescueDirective.severity}` : "",
                ...(frontRescueDirective?.families ?? []).map((family) => `family:${family}`)
              ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
            )
          }
        }
      });
      applyConsistencyScoring(
        scored,
        promptBundle.qualityProfile.targetStyle,
        promptBundle.speciesId,
        acceptedScoreThreshold
      );
      const bestAfterFrontRescue = groupBestByView(scored);
      frontBaselineCandidate = bestAfterFrontRescue.front;
      frontBaseline = isStrongFrontMasterCandidate(
        frontBaselineCandidate,
        promptBundle.qualityProfile.targetStyle,
        frontAnchorMinScore,
        promptBundle.speciesId
      )
        ? frontBaselineCandidate
        : undefined;
      await helpers.logJob(jobDbId, "info", "Front rescue completed", {
        frontCandidateId: frontBaselineCandidate?.candidate.id ?? null,
        frontCandidateScore: frontBaselineCandidate ? Number(frontBaselineCandidate.score.toFixed(4)) : null,
        frontRecovered: Boolean(frontBaseline)
      });
      syncRuntimeState();
    }
    if (frontBaselineCandidate && !frontBaseline) {
      const weakFrontMessage = "Front master candidate was too weak to use as the identity anchor.";
      providerWarning = providerWarning ? `${providerWarning} | ${weakFrontMessage}` : weakFrontMessage;
    }
    const remainingViews = requestedViews.filter((view) => view !== "front");
    const canProceedToAnglesWithoutStrongFront = generation.mode === "reference" || continuityReferenceSessionId !== null;
    const allowAngleGeneration = Boolean(frontBaseline) || canProceedToAnglesWithoutStrongFront;
    if (remainingViews.length > 0 && !allowAngleGeneration) {
      const stopMessage = "Angles skipped because front rescue did not produce a strong front anchor.";
      providerWarning = providerWarning ? `${providerWarning} | ${stopMessage}` : stopMessage;
      await helpers.logJob(jobDbId, "warn", "Skipping angle generation due to weak front anchor", {
        remainingViews,
        frontCandidateId: frontBaselineCandidate?.candidate.id ?? null,
        frontCandidateScore: frontBaselineCandidate ? Number(frontBaselineCandidate.score.toFixed(4)) : null,
        continuityReferenceSessionId
      });
      syncRuntimeState();
    }
    const anglePoseGuides = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: remainingViews
    });
      syncRuntimeState();

    let sideReference: InlineImageReference | undefined;

    if (frontBaseline) {
      sideReference = {
        referenceImageBase64: frontBaseline.candidate.data.toString("base64"),
        referenceMimeType: frontBaseline.candidate.mimeType
      };
    } else if (referenceImageBase64) {
      sideReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }

    if (remainingViews.length > 0 && allowAngleGeneration) {
      const starterReferenceByView = loadMascotStarterReferencesByView(promptBundle.speciesId, remainingViews);
      const preferredAngleReferenceInputByView = buildPreferredSideReferenceInputByView({
        views: remainingViews,
        speciesId: promptBundle.speciesId,
        familyReferencesByView: mascotFamilyReferencesByView,
        starterReferenceByView
      });
      const filteredAnglePoseGuides = excludePoseGuidesCoveredByStarter(
        "angles",
        anglePoseGuides,
        starterReferenceByView
      );
      const angleReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
      const angleReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const angleBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
      for (const view of remainingViews) {
        const bank: CharacterReferenceBankEntry[] = [];
        const starterReference = starterReferenceByView[view];
        const familyReference = mascotFamilyReferencesByView[view];
        const preferredSideReference = preferredAngleReferenceInputByView[view];
        const suppressStarterReference = shouldSuppressDuplicateViewStarterReference({
          stage: "angles",
          view,
          speciesId: promptBundle.speciesId,
          starterReference,
          familyReference
        });
        const sideStarterLikeReference = suppressStarterReference
          ? preferredSideReference
          : starterReference ?? preferredSideReference;
        const hasSideAnchor = Boolean(starterReference ?? preferredSideReference ?? familyReference);
        const initialAngleBiasAdjustment = buildInitialAngleReferenceBiasAdjustment({
          view,
          speciesId: promptBundle.speciesId,
          hasApprovedFrontAnchor: Boolean(frontBaseline)
        });
        if (preferredSideReference) {
          angleReferenceInputByView[view] = preferredSideReference;
        }
        if (frontBaseline) {
          bank.push(
            createReferenceBankEntry({
              id: `${frontBaseline.candidate.id}_front_master`,
              role: "front_master",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "front_master",
                targetView: view,
                hasStarter: hasSideAnchor
              }),
              note: "approved front master anchor",
              image: inlineReferenceFromCandidate(frontBaseline.candidate)
            })
          );
        } else if (sideReference) {
          bank.push(
            createReferenceBankEntry({
              id: `${view}_external_subject_anchor`,
              role: "subject",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "subject",
                targetView: view,
                hasStarter: hasSideAnchor
              }),
              note: "external fallback identity anchor",
              image: sideReference
            })
          );
        }
        if (sideStarterLikeReference && !suppressStarterReference) {
          bank.push(
            createReferenceBankEntry({
              id: starterReference ? `${view}_starter` : `${view}_preferred_side_starter`,
              role: "view_starter",
              view,
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "view_starter",
                targetView: view,
                hasStarter: true
              }),
              note:
                starterReference && "sourcePath" in starterReference
                  ? starterReference.sourcePath
                  : "preferred side reference starter anchor",
              image: sideStarterLikeReference
            })
          );
        }
        bank.push(
          ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: "angles",
          targetView: view,
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: hasSideAnchor,
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: shouldEnableMascotHeroMode({
              stage: "angles",
              heroMode: promptBundle.heroMode,
              frontAnchorScore: frontBaseline?.score
            })
          })
        );
        if (bank.length > 0) {
          angleReferenceBankByView[view] = dedupeReferenceBank(bank);
        }
        if (hasRetryAdjustmentContent(initialAngleBiasAdjustment)) {
          angleBaseAdjustmentsByView[view] = initialAngleBiasAdjustment;
        }
      }
      if (Object.keys(starterReferenceByView).length > 0) {
        starterReferencePathsByView = {
          ...(starterReferencePathsByView ?? {}),
          ...Object.fromEntries(
            Object.entries(starterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
          )
        };
      }
      flushRuntimeState();
      await runViewGeneration({
        views: remainingViews,
        stage: "angles",
        origin: "initial",
        passLabel: "angles.initial",
        reasonCodes: [
          frontBaseline
            ? "approved_front_anchor"
            : continuityReferenceSessionId
              ? "continuity_anchor"
              : "external_anchor_fallback"
        ],
        triggerViews: remainingViews,
        ...(sideReference ? { referenceInput: sideReference } : {}),
        ...(Object.keys(angleReferenceInputByView).length > 0 ? { referenceInputByView: angleReferenceInputByView } : {}),
        ...(Object.keys(angleReferenceBankByView).length > 0 ? { referenceBankByView: angleReferenceBankByView } : {}),
        ...(Object.keys(angleBaseAdjustmentsByView).length > 0
          ? { baseAdjustmentsByView: angleBaseAdjustmentsByView }
          : {}),
        ...(Object.keys(filteredAnglePoseGuides).length > 0 ? { poseGuidesByView: filteredAnglePoseGuides } : {})
      });
    }
  } else {
    let perViewReference: InlineImageReference | undefined;
    if (generation.viewToGenerate && generation.viewToGenerate !== "front") {
      perViewReference = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
      if (!perViewReference && sessionId) {
        perViewReference = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
      }
    } else if (referenceImageBase64) {
      perViewReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    const requestedPoseViews = requestedViews.filter((view) => view !== "front");
    const poseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: requestedPoseViews
    });
      syncRuntimeState();
    const starterReferenceByView = loadMascotStarterReferencesByView(promptBundle.speciesId, requestedViews);
    const filteredPoseGuidesByView = excludePoseGuidesCoveredByStarter(
      requestedBaseStage,
      poseGuidesByView,
      starterReferenceByView
    );
    const preferredSideReferenceInputByView = buildPreferredSideReferenceInputByView({
      views: requestedViews,
      speciesId: promptBundle.speciesId,
      familyReferencesByView: mascotFamilyReferencesByView,
      starterReferenceByView
    });
    const perViewReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const perViewReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    for (const view of requestedViews) {
      const bank: CharacterReferenceBankEntry[] = [];
      const starterReference = starterReferenceByView[view];
      const familyReference = mascotFamilyReferencesByView[view];
      const preferredSideReference = preferredSideReferenceInputByView[view];
      const suppressStarterReference = shouldSuppressDuplicateViewStarterReference({
        stage: requestedBaseStage,
        view,
        speciesId: promptBundle.speciesId,
        starterReference,
        familyReference
      });
      const sideStarterLikeReference = suppressStarterReference
        ? preferredSideReference
        : starterReference ?? preferredSideReference;
      const hasSideAnchor = Boolean(starterReference ?? preferredSideReference ?? familyReference);
      if (preferredSideReference) {
        perViewReferenceInputByView[view] = preferredSideReference;
      }
      if (perViewReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_reference_anchor`,
            role: generation.viewToGenerate ? "front_master" : "subject",
            view: generation.viewToGenerate && generation.viewToGenerate !== "front" ? "front" : view,
            weight: resolveAdaptiveReferenceWeight({
              stage: requestedBaseStage,
              role: generation.viewToGenerate ? "front_master" : "subject",
              targetView: view,
              hasStarter: hasSideAnchor
            }),
            note: generation.viewToGenerate ? "front continuity reference" : "shared external reference",
            image: perViewReference
          })
        );
      }
      if (sideStarterLikeReference && !suppressStarterReference) {
        bank.push(
          createReferenceBankEntry({
            id: starterReference ? `${view}_starter` : `${view}_preferred_side_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: requestedBaseStage,
              role: "view_starter",
              targetView: view,
              hasStarter: true
            }),
            note:
              starterReference && "sourcePath" in starterReference
                ? starterReference.sourcePath
                : "preferred side reference starter anchor",
            image: sideStarterLikeReference
          })
        );
      }
      bank.push(
        ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: requestedBaseStage,
          targetView: view,
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: hasSideAnchor,
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: shouldEnableMascotHeroMode({
            stage: requestedBaseStage,
            heroMode: promptBundle.heroMode
          })
        })
      );
      if (bank.length > 0) {
        perViewReferenceBankByView[view] = dedupeReferenceBank(bank);
      }
    }
    if (Object.keys(starterReferenceByView).length > 0) {
      starterReferencePathsByView = {
        ...(starterReferencePathsByView ?? {}),
        ...Object.fromEntries(
          Object.entries(starterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
        )
      };
    }

    flushRuntimeState();
      await runViewGeneration({
      views: requestedViews,
      stage: requestedBaseStage,
      origin: generation.viewToGenerate ? "view_regen" : "initial",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.regen` : "angles.initial_nonseq",
      reasonCodes: [generation.viewToGenerate ? "manual_view_request" : "non_sequential_base_pass"],
        triggerViews: requestedViews,
        ...(perViewReference ? { referenceInput: perViewReference } : {}),
        ...(Object.keys(perViewReferenceInputByView).length > 0 ? { referenceInputByView: perViewReferenceInputByView } : {}),
        ...(Object.keys(perViewReferenceBankByView).length > 0 ? { referenceBankByView: perViewReferenceBankByView } : {}),
        ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {})
      });
      syncRuntimeState();
  }

  applyConsistencyScoring(
    scored,
    promptBundle.qualityProfile.targetStyle,
    promptBundle.speciesId,
    acceptedScoreThreshold
  );
  const repairScoreFloor = Math.max(
    0.18,
    Math.min(
      acceptedScoreThreshold - 0.02,
      promptBundle.selectionHints.repairScoreFloor ?? acceptedScoreThreshold * 0.72
    )
  );

  if (ultraWorkflowEnabled) {
    const bestAfterBase = groupBestByView(scored);
    const frontBaseline = isStrongFrontMasterCandidate(
      bestAfterBase.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterBase.front
      : undefined;
    const frontReferenceForRefine = frontBaseline
      ? inlineReferenceFromCandidate(frontBaseline.candidate)
      : undefined;
    flushRuntimeState();
    await maybeRunUltraSideRefineStage({
      targetViews: requestedViews.filter((view) => view !== "front"),
      bestByView: bestAfterBase,
      frontReferenceInput: frontReferenceForRefine,
      origin: "refine_pass",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.refine` : "angles.refine",
      reasonCodes: [generation.viewToGenerate ? "single_view_soft_refine" : "angle_soft_refine"],
      triggerViews: requestedViews.filter((view) => view !== "front"),
      seedOffset: generation.viewToGenerate ? 3200 : 2200
    });
      syncRuntimeState();
    const bestAfterRefine = groupBestByView(scored);
    const refinedFrontBaseline = isStrongFrontMasterCandidate(
      bestAfterRefine.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterRefine.front
      : frontBaseline;
    const frontReferenceForLock = refinedFrontBaseline
      ? inlineReferenceFromCandidate(refinedFrontBaseline.candidate)
      : frontReferenceForRefine;
    flushRuntimeState();
    await maybeRunUltraIdentityLockStage({
      targetViews: requestedViews.filter((view) => view !== "front"),
      bestByView: bestAfterRefine,
      frontReferenceInput: frontReferenceForLock,
      origin: "lock_pass",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.identity_lock` : "angles.identity_lock",
      reasonCodes: [generation.viewToGenerate ? "single_view_identity_lock" : "angle_identity_lock"],
      triggerViews: requestedViews.filter((view) => view !== "front"),
      seedOffset: generation.viewToGenerate ? 4100 : 3100
    });
      syncRuntimeState();
    const bestAfterLock = groupBestByView(scored);
    const lockedFrontBaseline = isStrongFrontMasterCandidate(
      bestAfterLock.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterLock.front
      : refinedFrontBaseline;
    const sideViewAcceptanceGate = buildSideViewAcceptanceGate({
      targetViews: requestedViews.filter((view) => view !== "front"),
      baseByView: bestAfterBase,
      refineByView: bestAfterRefine,
      lockByView: bestAfterLock,
      acceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle
    });
      syncRuntimeState();
    if (Object.keys(sideViewAcceptanceGate.selectedByView).length > 0) {
      preferredSelectionByView = {
        ...preferredSelectionByView,
        ...sideViewAcceptanceGate.selectedByView
      };
      recordSideViewAcceptanceGateStage({
        views: requestedViews.filter((view) => view !== "front"),
        selectedByView: sideViewAcceptanceGate.selectedByView,
        gateDecisionsByView: sideViewAcceptanceGate.gateDecisionsByView,
        origin: "lock_pass",
        passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.acceptance_gate` : "angles.acceptance_gate",
        reasonCodes: ["side_view_acceptance_gate"],
        triggerViews: requestedViews.filter((view) => view !== "front"),
        seedOffset: generation.viewToGenerate ? 4700 : 3700
      });
      syncRuntimeState();
    }
    const bestAfterAcceptanceGate = {
      ...bestAfterLock,
      ...sideViewAcceptanceGate.selectedByView
    };
    const repairTriageCandidateByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
    for (const view of requestedViews) {
      const candidate =
        preferredSelectionByView[view] ??
        selectBestRepairBaseCandidate({
          scored,
          view,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold
        }) ??
        bestAfterAcceptanceGate[view];
      if (candidate) {
        repairTriageCandidateByView[view] = candidate;
      }
    }
    const repairTriagePackCoherence =
      generation.viewToGenerate === undefined
        ? buildPackCoherenceDiagnostics({
            selectedByView: repairTriageCandidateByView,
            targetStyle: promptBundle.qualityProfile.targetStyle,
            acceptedScoreThreshold,
            speciesId: promptBundle.speciesId
          })
        : undefined;
    const repairTriageGate = buildRepairTriageGate({
      targetViews: requestedViews,
      candidateByView: repairTriageCandidateByView,
      acceptedScoreThreshold,
      repairScoreFloor,
      frontAnchorAcceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      packCoherence: repairTriagePackCoherence,
      rigStability:
        generation.viewToGenerate === undefined
          ? assessRigStability({
              selectedByView: repairTriageCandidateByView,
              packCoherence: repairTriagePackCoherence,
              targetStyle: promptBundle.qualityProfile.targetStyle,
              speciesId: promptBundle.speciesId,
              autoReroute: autoRerouteDiagnostics
            })
          : undefined,
      speciesId: promptBundle.speciesId,
      gateDecisionsByView: sideViewAcceptanceGate.gateDecisionsByView
    });
      syncRuntimeState();
    applyRepairEmbargoDecisions(requestedViews, repairTriageGate.repairTriageByView);
    if (Object.keys(repairTriageGate.repairTriageByView).length > 0) {
      recordRepairTriageGateStage({
        views: requestedViews,
        selectedByView: repairTriageCandidateByView,
        repairTriageByView: repairTriageGate.repairTriageByView,
        origin: "repair_pass",
        passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.repair_triage` : "angles.repair_triage",
        reasonCodes: ["repair_triage_gate"],
        triggerViews: requestedViews,
        seedOffset: generation.viewToGenerate ? 5000 : 4000
      });
      syncRuntimeState();
    }

    if (repairTriageGate.repairViews.length > 0) {
      const repairReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const repairMaskByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const repairReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
      const repairBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
      const repairDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {
        ...repairTriageGate.directiveProfilesByView
      };
      const repairFromCandidateIds: Partial<Record<CharacterView, string>> = {};

      for (const view of repairTriageGate.repairViews) {
        const candidate = repairTriageGate.repairBaseByView[view];
        if (!candidate) {
          continue;
        }

        repairReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
        repairMaskByView[view] = await buildRepairMaskReferenceForCandidate(candidate);
        repairFromCandidateIds[view] = candidate.candidate.id;
        const repairDirective = buildRepairDirectiveProfile({
          stage: "repair",
          view,
          candidate,
          speciesId: promptBundle.speciesId
        });
      syncRuntimeState();
        const repairBaseAdjustment = repairDirective?.adjustment;
        if (hasRetryAdjustmentContent(repairBaseAdjustment)) {
          repairBaseAdjustmentsByView[view] = repairBaseAdjustment;
        }
        if (repairDirective && !repairDirectiveProfilesByView[view]) {
          repairDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(repairDirective);
        }
        const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);

        const bank: CharacterReferenceBankEntry[] = [
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_repair`,
            role: "repair_base",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "repair_base",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "best candidate before repair",
            image: inlineReferenceFromCandidate(candidate.candidate)
          }),
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_repair_composition`,
            role: "composition",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "composition",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "repair current draft composition",
            image: inlineReferenceFromCandidate(candidate.candidate)
          })
        ];

        if (lockedFrontBaseline) {
          bank.push(
            createReferenceBankEntry({
              id: `${lockedFrontBaseline.candidate.id}_front_master`,
              role: "front_master",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "repair",
                role: "front_master",
                targetView: view,
                hasStarter: Boolean(starterReference),
                directiveFamilies: repairDirective?.families,
                directiveSeverity: repairDirective?.severity
              }),
              note: "approved front master anchor",
              image: inlineReferenceFromCandidate(lockedFrontBaseline.candidate)
            })
          );
        }
        bank.push(
          ...buildMascotFamilyReferenceEntries({
            speciesId: promptBundle.speciesId,
            stage: "repair",
            targetView: view,
            familyReferencesByView: mascotFamilyReferencesByView,
            hasStarter: Boolean(starterReference),
            directiveFamilies: repairDirective?.families,
            directiveSeverity: repairDirective?.severity,
            preferMultiReference: promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: shouldEnableMascotHeroMode({
              stage: "repair",
              heroMode: promptBundle.heroMode,
              frontAnchorScore: lockedFrontBaseline?.score ?? frontBaseline?.score
            })
          })
        );

        repairReferenceBankByView[view] = dedupeReferenceBank(bank);
      }

      const repairViews = Object.keys(repairReferenceInputByView) as CharacterView[];
      if (repairViews.length > 0) {
        const repairCandidateCount = Math.max(
          1,
          Math.floor(
            (promptBundle.selectionHints.repairCandidateCount ?? 2) +
              Math.max(
                0,
                ...repairViews.map((view) => repairDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
              )
          )
        );
        const repairAcceptedScoreThreshold = Math.min(
          0.98,
          acceptedScoreThreshold +
            Math.max(
              0,
              ...repairViews.map((view) => repairDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0)
            )
        );
        await helpers.logJob(jobDbId, "info", "Running ultra repair/refine stage", {
          repairViews,
          repairMaskViews: Object.keys(repairMaskByView),
          repairScoreFloor: Number(repairScoreFloor.toFixed(4)),
          acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
          repairAcceptedScoreThreshold: Number(repairAcceptedScoreThreshold.toFixed(4)),
          repairCandidateCount,
          repairSourceCandidateIds: repairFromCandidateIds,
          repairDirectives: repairDirectiveProfilesByView
        });
      syncRuntimeState();
        flushRuntimeState();
      await runViewGeneration({
          views: repairViews,
          stage: "repair",
          origin: "repair_pass",
          passLabel: "repair.base",
          reasonCodes: ["repair_score_floor"],
          triggerViews: repairViews,
          candidateCountOverride: repairCandidateCount,
          acceptedScoreThresholdOverride: repairAcceptedScoreThreshold,
          referenceInput: refinedFrontBaseline ? inlineReferenceFromCandidate(refinedFrontBaseline.candidate) : undefined,
          referenceInputByView: repairReferenceInputByView,
          repairMaskByView,
          referenceBankByView: repairReferenceBankByView,
          ...(Object.keys(repairBaseAdjustmentsByView).length > 0
            ? {
                baseAdjustmentsByView: repairBaseAdjustmentsByView
              }
            : {}),
          ...(Object.keys(repairDirectiveProfilesByView).length > 0
            ? {
                directiveProfilesByView: repairDirectiveProfilesByView
              }
            : {}),
          repairFromCandidateIds,
          ...(Object.keys(repairTriageGate.repairLineageByView).length > 0
            ? {
                repairLineageByView: repairTriageGate.repairLineageByView
              }
            : {})
        });
      syncRuntimeState();
        applyConsistencyScoring(
          scored,
          promptBundle.qualityProfile.targetStyle,
          promptBundle.speciesId,
          acceptedScoreThreshold
        );
        const postRepairAcceptanceGate = buildPostRepairAcceptanceGate({
          targetViews: repairViews,
          preRepairByView: repairTriageGate.repairBaseByView,
          repairByView: Object.fromEntries(
            repairViews
              .map((view) => [
                view,
                selectBestCandidateForViewByStages({
                  scored,
                  view,
                  stages: ["repair_refine"]
                })
              ])
              .filter((entry): entry is [CharacterView, ScoredCandidate] => Boolean(entry[1]))
          ) as Partial<Record<CharacterView, ScoredCandidate>>,
          acceptedScoreThreshold,
          promotionThresholdByView: Object.fromEntries(
            repairViews.map((view) => [view, repairAcceptedScoreThreshold])
          ) as Partial<Record<CharacterView, number>>,
          targetStyle: promptBundle.qualityProfile.targetStyle
        });
      syncRuntimeState();
        if (Object.keys(postRepairAcceptanceGate.selectedByView).length > 0) {
          preferredSelectionByView = {
            ...preferredSelectionByView,
            ...postRepairAcceptanceGate.selectedByView
          };
          recordPostRepairAcceptanceGateStage({
            views: repairViews,
            selectedByView: postRepairAcceptanceGate.selectedByView,
            repairAcceptanceByView: postRepairAcceptanceGate.repairAcceptanceByView,
            acceptedScoreThresholdOverride: repairAcceptedScoreThreshold,
            origin: "repair_pass",
            passLabel: "repair.acceptance_gate",
            reasonCodes: ["post_repair_acceptance_gate"],
            triggerViews: repairViews,
            seedOffset: generation.viewToGenerate ? 5600 : 4600
          });
      syncRuntimeState();
        }
      }
    }
  }

  const preFallbackBest = mergePreferredSelectionByViewForSelection({
    baseSelectedByView: groupBestByViewForSelection({
      scored,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold
    }),
    preferredSelectionByView,
    targetStyle: promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold
  });
  const preFallbackLowQuality = requestedViews.filter((view) => {
    const candidate = preFallbackBest[view];
    if (!candidate) {
      return true;
    }
    if (candidate.rejections.length > 0) {
      return true;
    }
    if (
      isRuntimeBucketLowQuality({
        candidate,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold
      })
    ) {
      return true;
    }
    return candidate.score < acceptedScoreThreshold;
  });

  if (
    preFallbackLowQuality.length > 0 &&
    providerName !== "mock" &&
    allowLowQualityMockFallback
  ) {
    const fallbackMsg = `Low-quality views (${preFallbackLowQuality.join(
      ", "
    )}) detected. Running mock fallback candidates.`;
    providerWarning = providerWarning ? `${providerWarning} | ${fallbackMsg}` : fallbackMsg;
    providerName = "mock";
    provider = createCharacterProvider({ provider: "mock" });

    flushRuntimeState();
      await runViewGeneration({
      views: preFallbackLowQuality,
      stage: requestedBaseStage,
      origin: "mock_fallback",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.mock_fallback` : "angles.mock_fallback",
      reasonCodes: ["low_quality_fallback", "provider_mock"],
      triggerViews: preFallbackLowQuality,
      ...(referenceImageBase64
        ? {
            referenceInput: {
              referenceImageBase64,
              referenceMimeType
            }
          }
        : {})
    });
      syncRuntimeState();
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
  }

  flushRuntimeState();
  const autoRerouteResult = await runSelectionAutoRerouteFlow({
    requestedViews,
    scored,
    preferredSelectionByView,
    targetStyle: promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold,
    speciesId: promptBundle.speciesId,
    frontAnchorAcceptedScoreThreshold,
    generationViewToGenerate: generation.viewToGenerate,
    autoRerouteDiagnostics,
    groupBestByViewForSelection,
    mergePreferredSelectionByViewForSelection,
    isRuntimeBucketLowQuality,
    isRepairEmbargoedSelection,
    buildPackCoherenceDiagnostics,
    assessRigStability,
    isStrongFrontMasterCandidate,
    jobDbId,
    providerName,
    providerWarning,
    autoRerouteConfig,
    continuitySnapshot,
    promptBundle,
    clampedCandidateCount: clamped.candidateCount,
    repairScoreFloor,
    referenceImageBase64,
    referenceMimeType,
    starterReferencePathsByView,
    mascotFamilyReferencesByView,
    helpers,
    runViewGeneration,
    applyConsistencyScoring,
    decideAutoReroute: (flowInput: any) =>
      decideAutoReroute({
        ...flowInput,
        providerName: flowInput.providerName as CharacterProviderName
      }),
    inlineReferenceFromCandidate,
    loadMascotStarterReference,
    createReferenceBankEntry,
    resolveAdaptiveReferenceWeight,
    buildMascotFamilyReferenceEntries,
    dedupeReferenceBank,
    loadMascotStarterReferencesByView,
    buildPreferredSideReferenceInputByView,
    excludePoseGuidesCoveredByStarter,
    loadStagePoseGuides,
    shouldSuppressDuplicateViewStarterReference,
    maybeRunUltraSideRefineStage,
    maybeRunUltraIdentityLockStage,
    buildSideViewAcceptanceGate,
    recordSideViewAcceptanceGateStage,
    dedupeCharacterViews,
    selectBestRepairBaseCandidate,
    buildRepairTriageGate,
    applyRepairEmbargoDecisions,
    recordRepairTriageGateStage,
    buildRepairMaskReferenceForCandidate,
    resolveAutoRepairDirective: (flowInput: any) =>
      buildRepairDirectiveProfile({
        stage: "repair",
        view: flowInput.view as CharacterView,
        candidate: flowInput.candidate as ScoredCandidate,
        speciesId: flowInput.speciesId as MascotSpecies | undefined
      }),
    summarizeRepairDirectiveProfile,
    buildPostRepairAcceptanceGate,
    recordPostRepairAcceptanceGateStage,
    selectBestCandidateForViewByStages,
    buildAutoRerouteViewDelta,
    toFlatContinuityFields,
    shouldEnableMascotHeroMode,
    getRuntimeProviderState: () => ({
      providerName: runtimeState.providerName,
      providerWarning: runtimeState.providerWarning
    })
  });
  let selectionOutcome = autoRerouteResult.selectionOutcome;
  preferredSelectionByView = autoRerouteResult.preferredSelectionByView;
  starterReferencePathsByView = autoRerouteResult.starterReferencePathsByView;
  providerName = autoRerouteResult.providerName ?? providerName;
  providerWarning = autoRerouteResult.providerWarning;
  autoRerouteDiagnostics = autoRerouteResult.autoRerouteDiagnostics;
  await insertProviderCallLogs({
    prisma,
    sessionId,
    episodeId: payloadEpisodeId,
    callLogs: providerCallLogs
  });
  await writeGenerationProgress(84, "provider_logs_persisted", {
    callLogCount: providerCallLogs.length,
    provider: providerName
  });

  await upsertSessionCandidates({
    prisma,
    sessionId,
    scored,
    ...(generation.viewToGenerate ? { viewToGenerate: generation.viewToGenerate } : {})
  });
  await writeGenerationProgress(88, "session_candidates_persisted", {
    totalScored: scored.length,
    bestScores: summarizeBestScores(requestedViews)
  });


  flushRuntimeState();
  return selectionOutcome;
}

