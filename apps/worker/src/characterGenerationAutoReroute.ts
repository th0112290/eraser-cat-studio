// @ts-nocheck
import type { CharacterView } from "@ec/image-gen";

type InlineImageReferenceLike = {
  referenceImageBase64: string;
  referenceMimeType?: string;
  sourcePath?: string;
};

type ScoredCandidateLike = {
  score: number;
  warnings: string[];
  rejections: string[];
  consistencyScore?: number | null;
  candidate: {
    id: string;
    view: CharacterView;
    [key: string]: unknown;
  };
};

type PackCoherenceLike = {
  issues?: string[];
  severity?: "none" | "review" | "block";
  [key: string]: unknown;
};

type SelectionOutcomeLike = {
  selectedByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  runtimeLowQualityViews: CharacterView[];
  packCoherence: PackCoherenceLike | undefined;
  rigStability: unknown;
  coherenceIssues: string[];
  frontStrong: boolean;
};

type PromptBundleLike = {
  speciesId?: string;
  heroMode?: unknown;
  qualityProfile: {
    targetStyle?: string;
  };
  selectionHints: {
    frontMasterCandidateCount?: number;
    repairCandidateCount?: number;
    preferMultiReference?: boolean;
  };
};

type AutoRerouteDecisionLike = {
  strategy: string;
  triggers: string[];
  targetViews: CharacterView[];
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  seedOffset: number;
  notes: string[];
};

type AutoRerouteDiagnosticsLike = {
  attempted: boolean;
  strategy?: string;
  triggers: string[];
  targetViews: CharacterView[];
  candidateCountBoost?: number;
  acceptedScoreThresholdBoost?: number;
  seedOffset?: number;
  notes: string[];
  initialMissingViews: CharacterView[];
  finalMissingViews?: CharacterView[];
  initialLowQualityViews: CharacterView[];
  finalLowQualityViews?: CharacterView[];
  initialPackCoherence?: PackCoherenceLike;
  finalPackCoherence?: PackCoherenceLike;
  viewDeltaByView?: Partial<Record<CharacterView, unknown>>;
  recovered?: boolean;
  skippedReason?: string;
};

type RepairDirectiveProfileSummaryLike = {
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  [key: string]: unknown;
};

type SelectionOutcomeBuilderInput = {
  requestedViews: CharacterView[];
  scored: ScoredCandidateLike[];
  preferredSelectionByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  speciesId?: string;
  frontAnchorAcceptedScoreThreshold: number;
  generationViewToGenerate?: CharacterView;
  autoRerouteDiagnostics?: AutoRerouteDiagnosticsLike;
  groupBestByViewForSelection: (input: {
    scored: ScoredCandidateLike[];
    targetStyle?: string;
    acceptedScoreThreshold: number;
  }) => Partial<Record<CharacterView, ScoredCandidateLike>>;
  mergePreferredSelectionByViewForSelection: (input: {
    baseSelectedByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
    preferredSelectionByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
    targetStyle?: string;
    acceptedScoreThreshold: number;
  }) => Partial<Record<CharacterView, ScoredCandidateLike>>;
  isRuntimeBucketLowQuality: (input: {
    candidate: ScoredCandidateLike;
    targetStyle?: string;
    acceptedScoreThreshold: number;
  }) => boolean;
  isRepairEmbargoedSelection: (view: CharacterView, candidate: ScoredCandidateLike) => boolean;
  buildPackCoherenceDiagnostics: (input: {
    selectedByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
    targetStyle?: string;
    acceptedScoreThreshold: number;
    speciesId?: string;
  }) => PackCoherenceLike;
  assessRigStability: (input: {
    selectedByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
    packCoherence: PackCoherenceLike | undefined;
    targetStyle?: string;
    speciesId?: string;
    autoReroute?: AutoRerouteDiagnosticsLike;
  }) => unknown;
  isStrongFrontMasterCandidate: (
    candidate: ScoredCandidateLike | undefined,
    targetStyle: string | undefined,
    frontAnchorAcceptedScoreThreshold: number,
    speciesId?: string
  ) => boolean;
};

export function buildSelectionOutcome(input: any): any {
  const selectedByView = input.mergePreferredSelectionByViewForSelection({
    baseSelectedByView: input.groupBestByViewForSelection({
      scored: input.scored,
      targetStyle: input.targetStyle,
      acceptedScoreThreshold: input.acceptedScoreThreshold
    }),
    preferredSelectionByView: input.preferredSelectionByView,
    targetStyle: input.targetStyle,
    acceptedScoreThreshold: input.acceptedScoreThreshold
  });
  const missingGeneratedViews = input.requestedViews.filter((view) => !selectedByView[view]);
  const runtimeLowQualityViews = input.requestedViews.filter((view) => {
    const candidate = selectedByView[view];
    if (!candidate) {
      return false;
    }
    return input.isRuntimeBucketLowQuality({
      candidate,
      targetStyle: input.targetStyle,
      acceptedScoreThreshold: input.acceptedScoreThreshold
    });
  });
  const lowQualityGeneratedViews = input.requestedViews.filter((view) => {
    const candidate = selectedByView[view];
    if (!candidate) {
      return true;
    }
    if (input.isRepairEmbargoedSelection(view, candidate)) {
      return true;
    }
    if (candidate.rejections.length > 0) {
      return true;
    }
    if (runtimeLowQualityViews.includes(view)) {
      return true;
    }
    return candidate.score < input.acceptedScoreThreshold;
  });
  const packCoherence =
    input.generationViewToGenerate === undefined
      ? input.buildPackCoherenceDiagnostics({
          selectedByView,
          targetStyle: input.targetStyle,
          acceptedScoreThreshold: input.acceptedScoreThreshold,
          speciesId: input.speciesId
        })
      : undefined;
  const rigStability =
    input.generationViewToGenerate === undefined
      ? input.assessRigStability({
          selectedByView,
          packCoherence,
          targetStyle: input.targetStyle,
          speciesId: input.speciesId,
          autoReroute: input.autoRerouteDiagnostics
        })
      : undefined;

  return {
    selectedByView,
    missingGeneratedViews,
    lowQualityGeneratedViews,
    runtimeLowQualityViews,
    packCoherence,
    rigStability,
    coherenceIssues: packCoherence?.issues ?? [],
    frontStrong: input.isStrongFrontMasterCandidate(
      selectedByView.front,
      input.targetStyle,
      input.frontAnchorAcceptedScoreThreshold,
      input.speciesId
    )
  };
}

export async function runSelectionAutoRerouteFlow(input: any): Promise<any> {
  let providerWarning = input.providerWarning;
  let preferredSelectionByView = input.preferredSelectionByView;
  let starterReferencePathsByView = input.starterReferencePathsByView;
  let autoRerouteDiagnostics = input.autoRerouteDiagnostics;
  let selectionOutcome = buildSelectionOutcome({
    ...input,
    preferredSelectionByView,
    autoRerouteDiagnostics
  });

  const autoRerouteDecision = input.decideAutoReroute({
    config: input.autoRerouteConfig,
    generationViewToGenerate: input.generationViewToGenerate,
    providerName: input.providerName,
    requestedViews: input.requestedViews,
    packCoherence: selectionOutcome.packCoherence,
    rigStability: selectionOutcome.rigStability,
    missingGeneratedViews: selectionOutcome.missingGeneratedViews,
    lowQualityGeneratedViews: selectionOutcome.lowQualityGeneratedViews,
    runtimeLowQualityViews: selectionOutcome.runtimeLowQualityViews,
    frontStrong: selectionOutcome.frontStrong,
    continuity: input.continuitySnapshot
  });
  if (!autoRerouteDecision) {
    return {
      selectionOutcome,
      preferredSelectionByView,
      starterReferencePathsByView,
      providerWarning,
      autoRerouteDiagnostics
    };
  }

  const autoRerouteSelectionBefore = { ...selectionOutcome.selectedByView };
  autoRerouteDiagnostics = {
    attempted: true,
    strategy: autoRerouteDecision.strategy,
    triggers: autoRerouteDecision.triggers,
    targetViews: autoRerouteDecision.targetViews,
    candidateCountBoost: autoRerouteDecision.candidateCountBoost,
    acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost,
    seedOffset: autoRerouteDecision.seedOffset,
    notes: autoRerouteDecision.notes,
    initialMissingViews: selectionOutcome.missingGeneratedViews,
    initialLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
    ...(selectionOutcome.packCoherence ? { initialPackCoherence: selectionOutcome.packCoherence } : {})
  };
  providerWarning = [
    providerWarning,
    `auto reroute ${autoRerouteDecision.strategy} for ${autoRerouteDecision.targetViews.join(", ")}`
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .join(" | ");
  await input.helpers.logJob(input.jobDbId, "info", "Running auto reroute after pack diagnostics", {
    strategy: autoRerouteDecision.strategy,
    triggers: autoRerouteDecision.triggers,
    targetViews: autoRerouteDecision.targetViews,
    candidateCountBoost: autoRerouteDecision.candidateCountBoost,
    acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost,
    seedOffset: autoRerouteDecision.seedOffset,
    initialPackCoherence: selectionOutcome.packCoherence,
    initialMissingViews: selectionOutcome.missingGeneratedViews,
    initialLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
    ...input.toFlatContinuityFields(input.continuitySnapshot)
  });

  if (autoRerouteDecision.targetViews.includes("front")) {
    const rerouteFrontStarterReference = input.loadMascotStarterReference(input.promptBundle.speciesId, "front");
    const rerouteFrontReferenceBank: unknown[] = [];
    if (input.referenceImageBase64) {
      rerouteFrontReferenceBank.push(
        input.createReferenceBankEntry({
          id: "auto_reroute_front_subject_reference",
          role: "subject",
          view: "front",
          weight: input.resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "subject",
            targetView: "front",
            hasStarter: Boolean(rerouteFrontStarterReference)
          }),
          note: "auto reroute subject anchor",
          image: {
            referenceImageBase64: input.referenceImageBase64,
            referenceMimeType: input.referenceMimeType
          }
        })
      );
    }
    if (rerouteFrontStarterReference) {
      rerouteFrontReferenceBank.push(
        input.createReferenceBankEntry({
          id: "auto_reroute_front_starter",
          role: "starter",
          view: "front",
          weight: input.resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "starter",
            targetView: "front",
            hasStarter: true
          }),
          note: rerouteFrontStarterReference.sourcePath,
          image: rerouteFrontStarterReference
        })
      );
    }
    rerouteFrontReferenceBank.push(
      ...input.buildMascotFamilyReferenceEntries({
        speciesId: input.promptBundle.speciesId,
        stage: "front",
        targetView: "front",
        familyReferencesByView: input.mascotFamilyReferencesByView,
        hasStarter: Boolean(rerouteFrontStarterReference),
        preferMultiReference: input.promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: input.shouldEnableMascotHeroMode({
          stage: "front",
          heroMode: input.promptBundle.heroMode,
          frontAnchorScore: selectionOutcome.selectedByView.front?.score
        })
      })
    );
    await input.runViewGeneration({
      views: ["front"],
      stage: "front",
      origin: "auto_reroute",
      passLabel: "front.auto_reroute",
      reasonCodes: autoRerouteDecision.triggers,
      triggerViews: autoRerouteDecision.targetViews,
      candidateCountOverride: Math.max(
        input.clampedCandidateCount,
        Math.floor(input.promptBundle.selectionHints.frontMasterCandidateCount ?? input.clampedCandidateCount) +
          autoRerouteDecision.candidateCountBoost
      ),
      acceptedScoreThresholdOverride: Math.min(
        0.98,
        input.frontAnchorAcceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost
      ),
      ...(rerouteFrontReferenceBank.length > 0
        ? { referenceBank: input.dedupeReferenceBank(rerouteFrontReferenceBank) }
        : {}),
      budgetViewCount: input.requestedViews.length,
      seedOffset: autoRerouteDecision.seedOffset
    });
    input.applyConsistencyScoring(
      input.scored,
      input.promptBundle.qualityProfile.targetStyle,
      input.promptBundle.speciesId,
      input.acceptedScoreThreshold
    );
    selectionOutcome = buildSelectionOutcome({
      ...input,
      preferredSelectionByView,
      autoRerouteDiagnostics
    });
  }

  const autoRerouteFrontBaseline = selectionOutcome.frontStrong ? selectionOutcome.selectedByView.front : undefined;
  const autoRerouteSideViews = autoRerouteDecision.targetViews.filter((view) => view !== "front");
  let autoRerouteAcceptanceGate:
    | ReturnType<typeof input.buildSideViewAcceptanceGate>
    | undefined;

  if (autoRerouteSideViews.length > 0) {
    let autoRerouteSideReference: InlineImageReferenceLike | undefined;
    if (autoRerouteFrontBaseline) {
      autoRerouteSideReference = input.inlineReferenceFromCandidate(autoRerouteFrontBaseline.candidate);
    } else if (input.referenceImageBase64) {
      autoRerouteSideReference = {
        referenceImageBase64: input.referenceImageBase64,
        referenceMimeType: input.referenceMimeType
      };
    }

    if (autoRerouteSideReference) {
      const autoRerouteStarterReferenceByView = input.loadMascotStarterReferencesByView(
        input.promptBundle.speciesId,
        autoRerouteSideViews
      );
      const autoRerouteReferenceInputByView = input.buildPreferredSideReferenceInputByView({
        views: autoRerouteSideViews,
        speciesId: input.promptBundle.speciesId,
        familyReferencesByView: input.mascotFamilyReferencesByView,
        starterReferenceByView: autoRerouteStarterReferenceByView
      });
      const autoReroutePoseGuidesByView = input.excludePoseGuidesCoveredByStarter(
        "angles",
        input.loadStagePoseGuides({
          speciesId: input.promptBundle.speciesId,
          views: autoRerouteSideViews
        }),
        autoRerouteStarterReferenceByView
      );
      if (Object.keys(autoRerouteStarterReferenceByView).length > 0) {
        starterReferencePathsByView = {
          ...(starterReferencePathsByView ?? {}),
          ...Object.fromEntries(
            Object.entries(autoRerouteStarterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
          )
        };
      }
      const autoRerouteReferenceBankByView: Partial<Record<CharacterView, unknown[]>> = {};
      for (const view of autoRerouteSideViews) {
        const starterReference = autoRerouteStarterReferenceByView[view];
        const familyReference = input.mascotFamilyReferencesByView[view];
        const preferredSideReference = autoRerouteReferenceInputByView[view];
        const suppressStarterReference = input.shouldSuppressDuplicateViewStarterReference({
          stage: "angles",
          view,
          speciesId: input.promptBundle.speciesId,
          starterReference,
          familyReference
        });
        const sideStarterLikeReference = suppressStarterReference
          ? preferredSideReference
          : starterReference ?? preferredSideReference;
        const hasSideAnchor = Boolean(starterReference ?? preferredSideReference ?? familyReference);
        const bank: unknown[] = [];
        if (autoRerouteFrontBaseline) {
          bank.push(
            input.createReferenceBankEntry({
              id: `${autoRerouteFrontBaseline.candidate.id}_auto_reroute_front_master`,
              role: "front_master",
              view: "front",
              weight: input.resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "front_master",
                targetView: view,
                hasStarter: hasSideAnchor
              }),
              note: "auto reroute front anchor",
              image: input.inlineReferenceFromCandidate(autoRerouteFrontBaseline.candidate)
            })
          );
        } else {
          bank.push(
            input.createReferenceBankEntry({
              id: `${view}_auto_reroute_subject_anchor`,
              role: "subject",
              view: "front",
              weight: input.resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "subject",
                targetView: view,
                hasStarter: hasSideAnchor
              }),
              note: "auto reroute external subject anchor",
              image: autoRerouteSideReference
            })
          );
        }
        if (sideStarterLikeReference && !suppressStarterReference) {
          bank.push(
            input.createReferenceBankEntry({
              id: starterReference
                ? `${view}_auto_reroute_starter`
                : `${view}_auto_reroute_preferred_side_starter`,
              role: "view_starter",
              view,
              weight: input.resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "view_starter",
                targetView: view,
                hasStarter: true
              }),
              note:
                starterReference && "sourcePath" in starterReference
                  ? starterReference.sourcePath
                  : "auto reroute preferred side reference starter anchor",
              image: sideStarterLikeReference
            })
          );
        }
        bank.push(
          ...input.buildMascotFamilyReferenceEntries({
            speciesId: input.promptBundle.speciesId,
            stage: "angles",
            targetView: view,
            familyReferencesByView: input.mascotFamilyReferencesByView,
            hasStarter: hasSideAnchor,
            preferMultiReference: input.promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: input.shouldEnableMascotHeroMode({
              stage: "angles",
              heroMode: input.promptBundle.heroMode,
              frontAnchorScore: autoRerouteFrontBaseline?.score
            })
          })
        );
        if (bank.length > 0) {
          autoRerouteReferenceBankByView[view] = input.dedupeReferenceBank(bank);
        }
      }
      await input.runViewGeneration({
        views: autoRerouteSideViews,
        stage: "angles",
        origin: "auto_reroute",
        passLabel: "angles.auto_reroute",
        reasonCodes: autoRerouteDecision.triggers,
        triggerViews: autoRerouteDecision.targetViews,
        referenceInput: autoRerouteSideReference,
        ...(Object.keys(autoRerouteReferenceInputByView).length > 0
          ? { referenceInputByView: autoRerouteReferenceInputByView }
          : {}),
        ...(Object.keys(autoRerouteReferenceBankByView).length > 0
          ? { referenceBankByView: autoRerouteReferenceBankByView }
          : {}),
        ...(Object.keys(autoReroutePoseGuidesByView).length > 0
          ? { poseGuidesByView: autoReroutePoseGuidesByView }
          : {}),
        candidateCountOverride: Math.max(
          input.clampedCandidateCount,
          input.clampedCandidateCount + autoRerouteDecision.candidateCountBoost
        ),
        acceptedScoreThresholdOverride: Math.min(
          0.98,
          input.acceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost
        ),
        seedOffset: autoRerouteDecision.seedOffset + 5000
      });
      input.applyConsistencyScoring(
        input.scored,
        input.promptBundle.qualityProfile.targetStyle,
        input.promptBundle.speciesId,
        input.acceptedScoreThreshold
      );
      const autoRerouteBestAfterBase = input.groupBestByViewForSelection({
        scored: input.scored,
        targetStyle: input.promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      });
      await input.maybeRunUltraSideRefineStage({
        targetViews: autoRerouteSideViews,
        bestByView: autoRerouteBestAfterBase,
        frontReferenceInput: autoRerouteSideReference,
        origin: "auto_reroute",
        passLabel: "angles.refine_auto_reroute",
        reasonCodes: [...autoRerouteDecision.triggers, "side_view_refine"],
        triggerViews: autoRerouteSideViews,
        seedOffset: autoRerouteDecision.seedOffset + 7000,
        acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost * 0.35,
        candidateCountBoost: Math.max(0, autoRerouteDecision.candidateCountBoost - 1)
      });
      const autoRerouteBestAfterRefine = input.groupBestByViewForSelection({
        scored: input.scored,
        targetStyle: input.promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      });
      await input.maybeRunUltraIdentityLockStage({
        targetViews: autoRerouteSideViews,
        bestByView: autoRerouteBestAfterRefine,
        frontReferenceInput: autoRerouteSideReference,
        origin: "auto_reroute",
        passLabel: "angles.identity_lock_auto_reroute",
        reasonCodes: [...autoRerouteDecision.triggers, "identity_lock_refine"],
        triggerViews: autoRerouteSideViews,
        seedOffset: autoRerouteDecision.seedOffset + 8200,
        acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost * 0.45,
        candidateCountBoost: Math.max(0, autoRerouteDecision.candidateCountBoost - 1)
      });
      const autoRerouteBestAfterLock = input.groupBestByViewForSelection({
        scored: input.scored,
        targetStyle: input.promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      });
      autoRerouteAcceptanceGate = input.buildSideViewAcceptanceGate({
        targetViews: autoRerouteSideViews,
        baseByView: autoRerouteBestAfterBase,
        refineByView: autoRerouteBestAfterRefine,
        lockByView: autoRerouteBestAfterLock,
        acceptedScoreThreshold: input.acceptedScoreThreshold,
        targetStyle: input.promptBundle.qualityProfile.targetStyle
      });
      if (Object.keys(autoRerouteAcceptanceGate.selectedByView).length > 0) {
        preferredSelectionByView = {
          ...preferredSelectionByView,
          ...autoRerouteAcceptanceGate.selectedByView
        };
        input.recordSideViewAcceptanceGateStage({
          views: autoRerouteSideViews,
          selectedByView: autoRerouteAcceptanceGate.selectedByView,
          gateDecisionsByView: autoRerouteAcceptanceGate.gateDecisionsByView,
          origin: "auto_reroute",
          passLabel: "angles.acceptance_gate_auto_reroute",
          reasonCodes: [...autoRerouteDecision.triggers, "side_view_acceptance_gate"],
          triggerViews: autoRerouteSideViews,
          seedOffset: autoRerouteDecision.seedOffset + 8600
        });
      }
      selectionOutcome = buildSelectionOutcome({
        ...input,
        preferredSelectionByView,
        autoRerouteDiagnostics
      });
    }
  }

  const autoRerouteRepairFrontBaseline = selectionOutcome.frontStrong ? selectionOutcome.selectedByView.front : undefined;
  const autoRerouteRepairCandidates = selectionOutcome.selectedByView;
  const autoRerouteRepairCandidateByView: Partial<Record<CharacterView, ScoredCandidateLike>> = {};
  for (const view of input.dedupeCharacterViews(autoRerouteDecision.targetViews)) {
    const candidate =
      preferredSelectionByView[view] ??
      input.selectBestRepairBaseCandidate({
        scored: input.scored,
        view,
        targetStyle: input.promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      }) ??
      autoRerouteRepairCandidates[view];
    if (candidate) {
      autoRerouteRepairCandidateByView[view] = candidate;
    }
  }
  const autoRerouteRepairTriage = input.buildRepairTriageGate({
    targetViews: autoRerouteDecision.targetViews,
    candidateByView: autoRerouteRepairCandidateByView,
    acceptedScoreThreshold: Math.min(
      0.98,
      input.acceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost * 0.5
    ),
    repairScoreFloor: input.repairScoreFloor,
    frontAnchorAcceptedScoreThreshold: input.frontAnchorAcceptedScoreThreshold,
    targetStyle: input.promptBundle.qualityProfile.targetStyle,
    packCoherence: selectionOutcome.packCoherence,
    rigStability: selectionOutcome.rigStability,
    speciesId: input.promptBundle.speciesId,
    gateDecisionsByView: autoRerouteAcceptanceGate?.gateDecisionsByView
  });
  input.applyRepairEmbargoDecisions(autoRerouteDecision.targetViews, autoRerouteRepairTriage.repairTriageByView);
  if (Object.keys(autoRerouteRepairTriage.repairTriageByView).length > 0) {
    input.recordRepairTriageGateStage({
      views: input.dedupeCharacterViews(autoRerouteDecision.targetViews),
      selectedByView: autoRerouteRepairCandidateByView,
      repairTriageByView: autoRerouteRepairTriage.repairTriageByView,
      origin: "auto_reroute",
      passLabel: "angles.repair_triage_auto_reroute",
      reasonCodes: [...autoRerouteDecision.triggers, "repair_triage_gate"],
      triggerViews: autoRerouteDecision.targetViews,
      seedOffset: autoRerouteDecision.seedOffset + 8800
    });
  }
  selectionOutcome = buildSelectionOutcome({
    ...input,
    preferredSelectionByView,
    autoRerouteDiagnostics
  });

  if (autoRerouteRepairTriage.repairViews.length > 0) {
    const autoRerouteRepairReferenceInputByView: Partial<Record<CharacterView, InlineImageReferenceLike>> = {};
    const autoRerouteRepairMaskByView: Partial<Record<CharacterView, InlineImageReferenceLike>> = {};
    const autoRerouteRepairReferenceBankByView: Partial<Record<CharacterView, unknown[]>> = {};
    const autoRerouteRepairBaseAdjustmentsByView: Partial<Record<CharacterView, Record<string, unknown>>> = {};
    const autoRerouteRepairDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummaryLike>> = {
      ...autoRerouteRepairTriage.directiveProfilesByView
    };
    const autoRerouteRepairFromCandidateIds: Partial<Record<CharacterView, string>> = {};

    for (const view of autoRerouteRepairTriage.repairViews) {
      const candidate = autoRerouteRepairTriage.repairBaseByView[view];
      if (!candidate) {
        continue;
      }
      autoRerouteRepairReferenceInputByView[view] = input.inlineReferenceFromCandidate(candidate.candidate);
      const repairMask = await input.buildRepairMaskReferenceForCandidate(candidate);
      if (repairMask) {
        autoRerouteRepairMaskByView[view] = repairMask;
      }
      autoRerouteRepairFromCandidateIds[view] = candidate.candidate.id;
      const repairDirective = input.resolveAutoRepairDirective({
        speciesId: input.promptBundle.speciesId,
        view,
        candidate,
        acceptedScoreThreshold: input.acceptedScoreThreshold,
        targetStyle: input.promptBundle.qualityProfile.targetStyle
      });
      if (repairDirective?.adjustment) {
        autoRerouteRepairBaseAdjustmentsByView[view] = repairDirective.adjustment;
      }
      if (repairDirective && !autoRerouteRepairDirectiveProfilesByView[view]) {
        autoRerouteRepairDirectiveProfilesByView[view] = input.summarizeRepairDirectiveProfile(repairDirective);
      }

      const starterReference = input.loadMascotStarterReferencesByView(input.promptBundle.speciesId, [view])[view];
      const familyReference = input.mascotFamilyReferencesByView[view];
      const preferredSideReference = autoRerouteRepairReferenceInputByView[view];
      const suppressStarterReference = input.shouldSuppressDuplicateViewStarterReference({
        stage: "repair",
        view,
        speciesId: input.promptBundle.speciesId,
        starterReference,
        familyReference
      });
      const sideStarterLikeReference = suppressStarterReference
        ? preferredSideReference
        : starterReference ?? preferredSideReference;
      const hasSideAnchor = Boolean(starterReference ?? preferredSideReference ?? familyReference);
      const bank: unknown[] = [];
      if (autoRerouteRepairFrontBaseline) {
        bank.push(
          input.createReferenceBankEntry({
            id: `${autoRerouteRepairFrontBaseline.candidate.id}_auto_reroute_front_master`,
            role: "front_master",
            view: "front",
            weight: input.resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "front_master",
              targetView: view,
              hasStarter: hasSideAnchor
            }),
            note: "auto reroute repair front anchor",
            image: input.inlineReferenceFromCandidate(autoRerouteRepairFrontBaseline.candidate)
          })
        );
      }
      if (sideStarterLikeReference && !suppressStarterReference) {
        bank.push(
          input.createReferenceBankEntry({
            id: starterReference
              ? `${view}_auto_reroute_repair_starter`
              : `${view}_auto_reroute_repair_preferred_side_starter`,
            role: "view_starter",
            view,
            weight: input.resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "view_starter",
              targetView: view,
              hasStarter: true
            }),
            note:
              starterReference && "sourcePath" in starterReference
                ? starterReference.sourcePath
                : "auto reroute repair preferred side starter anchor",
            image: sideStarterLikeReference
          })
        );
      }
      bank.push(
        ...input.buildMascotFamilyReferenceEntries({
          speciesId: input.promptBundle.speciesId,
          stage: "repair",
          targetView: view,
          familyReferencesByView: input.mascotFamilyReferencesByView,
          hasStarter: hasSideAnchor,
          preferMultiReference: input.promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: input.shouldEnableMascotHeroMode({
            stage: "repair",
            heroMode: input.promptBundle.heroMode,
            frontAnchorScore: autoRerouteRepairFrontBaseline?.score
          })
        })
      );
      autoRerouteRepairReferenceBankByView[view] = input.dedupeReferenceBank(bank);
    }

    const resolvedAutoRerouteRepairViews = Object.keys(autoRerouteRepairReferenceInputByView) as CharacterView[];
    if (resolvedAutoRerouteRepairViews.length > 0) {
      const rerouteRepairCandidateCount = Math.max(
        1,
        Math.floor(
          (input.promptBundle.selectionHints.repairCandidateCount ?? 2) +
            autoRerouteDecision.candidateCountBoost +
            Math.max(
              0,
              ...resolvedAutoRerouteRepairViews.map(
                (view) => autoRerouteRepairDirectiveProfilesByView[view]?.candidateCountBoost ?? 0
              )
            )
        )
      );
      const rerouteRepairAcceptedScoreThreshold = Math.min(
        0.98,
        input.acceptedScoreThreshold +
          autoRerouteDecision.acceptedScoreThresholdBoost +
          Math.max(
            0,
            ...resolvedAutoRerouteRepairViews.map(
              (view) => autoRerouteRepairDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0
            )
          )
      );
      await input.runViewGeneration({
        views: resolvedAutoRerouteRepairViews,
        stage: "repair",
        origin: "auto_reroute",
        passLabel: "repair.auto_reroute",
        reasonCodes: [...autoRerouteDecision.triggers, "repair_refine"],
        triggerViews: resolvedAutoRerouteRepairViews,
        candidateCountOverride: rerouteRepairCandidateCount,
        acceptedScoreThresholdOverride: rerouteRepairAcceptedScoreThreshold,
        referenceInput: autoRerouteRepairFrontBaseline
          ? input.inlineReferenceFromCandidate(autoRerouteRepairFrontBaseline.candidate)
          : undefined,
        referenceInputByView: autoRerouteRepairReferenceInputByView,
        repairMaskByView: autoRerouteRepairMaskByView,
        referenceBankByView: autoRerouteRepairReferenceBankByView,
        ...(Object.keys(autoRerouteRepairBaseAdjustmentsByView).length > 0
          ? { baseAdjustmentsByView: autoRerouteRepairBaseAdjustmentsByView }
          : {}),
        ...(Object.keys(autoRerouteRepairDirectiveProfilesByView).length > 0
          ? { directiveProfilesByView: autoRerouteRepairDirectiveProfilesByView }
          : {}),
        repairFromCandidateIds: autoRerouteRepairFromCandidateIds,
        ...(Object.keys(autoRerouteRepairTriage.repairLineageByView).length > 0
          ? { repairLineageByView: autoRerouteRepairTriage.repairLineageByView }
          : {}),
        seedOffset: autoRerouteDecision.seedOffset + 9000
      });
      input.applyConsistencyScoring(
        input.scored,
        input.promptBundle.qualityProfile.targetStyle,
        input.promptBundle.speciesId,
        input.acceptedScoreThreshold
      );
      const postRepairAcceptanceGate = input.buildPostRepairAcceptanceGate({
        targetViews: resolvedAutoRerouteRepairViews,
        preRepairByView: autoRerouteRepairTriage.repairBaseByView,
        repairByView: Object.fromEntries(
          resolvedAutoRerouteRepairViews
            .map((view) => [
              view,
              input.selectBestCandidateForViewByStages({
                scored: input.scored,
                view,
                stages: ["repair_refine"]
              })
            ])
            .filter((entry): entry is [CharacterView, ScoredCandidateLike] => Boolean(entry[1]))
        ) as Partial<Record<CharacterView, ScoredCandidateLike>>,
        acceptedScoreThreshold: input.acceptedScoreThreshold,
        promotionThresholdByView: Object.fromEntries(
          resolvedAutoRerouteRepairViews.map((view) => [view, rerouteRepairAcceptedScoreThreshold])
        ) as Partial<Record<CharacterView, number>>,
        targetStyle: input.promptBundle.qualityProfile.targetStyle
      });
      if (Object.keys(postRepairAcceptanceGate.selectedByView).length > 0) {
        preferredSelectionByView = {
          ...preferredSelectionByView,
          ...postRepairAcceptanceGate.selectedByView
        };
        input.recordPostRepairAcceptanceGateStage({
          views: resolvedAutoRerouteRepairViews,
          selectedByView: postRepairAcceptanceGate.selectedByView,
          repairAcceptanceByView: postRepairAcceptanceGate.repairAcceptanceByView,
          acceptedScoreThresholdOverride: rerouteRepairAcceptedScoreThreshold,
          origin: "auto_reroute",
          passLabel: "repair.acceptance_gate_auto_reroute",
          reasonCodes: [...autoRerouteDecision.triggers, "post_repair_acceptance_gate"],
          triggerViews: resolvedAutoRerouteRepairViews,
          seedOffset: autoRerouteDecision.seedOffset + 9400
        });
      }
      selectionOutcome = buildSelectionOutcome({
        ...input,
        preferredSelectionByView,
        autoRerouteDiagnostics
      });
    }
  }

  const autoRerouteViewDelta = input.buildAutoRerouteViewDelta({
    before: autoRerouteSelectionBefore,
    after: selectionOutcome.selectedByView,
    views: autoRerouteDecision.targetViews
  });
  autoRerouteDiagnostics = {
    ...autoRerouteDiagnostics,
    finalMissingViews: selectionOutcome.missingGeneratedViews,
    finalLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
    ...(selectionOutcome.packCoherence ? { finalPackCoherence: selectionOutcome.packCoherence } : {}),
    ...(autoRerouteViewDelta ? { viewDeltaByView: autoRerouteViewDelta } : {}),
    recovered:
      selectionOutcome.missingGeneratedViews.length === 0 &&
      selectionOutcome.lowQualityGeneratedViews.length === 0 &&
      (selectionOutcome.packCoherence?.severity ?? "none") !== "block"
  };
  await input.helpers.logJob(
    input.jobDbId,
    autoRerouteDiagnostics.recovered ? "info" : "warn",
    autoRerouteDiagnostics.recovered ? "Auto reroute recovered blocked pack" : "Auto reroute did not fully recover blocked pack",
    {
      strategy: autoRerouteDecision.strategy,
      triggers: autoRerouteDecision.triggers,
      targetViews: autoRerouteDecision.targetViews,
      initialPackCoherence: autoRerouteDiagnostics.initialPackCoherence,
      finalPackCoherence: autoRerouteDiagnostics.finalPackCoherence,
      finalMissingViews: autoRerouteDiagnostics.finalMissingViews,
      finalLowQualityViews: autoRerouteDiagnostics.finalLowQualityViews
    }
  );

  return {
    selectionOutcome,
    preferredSelectionByView,
    starterReferencePathsByView,
    providerWarning,
    autoRerouteDiagnostics
  };
}
