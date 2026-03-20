import fs from "node:fs";
import path from "node:path";
import {
  createCharacterProvider,
  resolveProviderName,
  type CharacterGenerationCandidate,
  type CharacterProviderCallLog,
  type CharacterProviderGenerateInput
} from "@ec/image-gen";

type PromptBundleLike = {
  speciesId?: string;
  qualityProfile: {
    targetStyle?: string;
  };
  selectionHints: {
    minAcceptedScore?: number;
    frontMasterMinAcceptedScore?: number;
    autoRetryRounds?: number;
    sequentialReference?: boolean;
  };
};

type MascotReferenceBankDiagnosticsLike = {
  status: string;
  missingRoles: string[];
  statusMismatch?: boolean;
  declaredStatus?: string;
  requiredAssetSlots: string[];
};

type MascotReferenceBankReviewPlanLike = {
  requiredManualSlots: string[];
};

type LimitsLike = {
  maxRetries: number;
  costPerImageUsd: number;
  budgetFallbackToMock: boolean;
};

type BudgetLike = {
  wouldExceed: boolean;
  monthSpentUsd: number;
  monthBudgetUsd: number;
  estimatedCostThisRunUsd: number;
};

type QualityConfigLike = {
  minAcceptedScore: number;
  lowQualityFallbackToMock: boolean;
  autoRetryRounds: number;
  sequentialReference: boolean;
};

type ProviderLike = {
  generate: (input: CharacterProviderGenerateInput) => Promise<{
    candidates: CharacterGenerationCandidate[];
    workflowHash: string;
    generatedAt: string;
    providerMeta?: Record<string, unknown>;
    callLogs?: CharacterProviderCallLog[];
  }>;
};

export async function initializeGenerationProviderRuntime(input: {
  prisma: unknown;
  totalImages: number;
  limits: LimitsLike;
  comfyUiUrl?: string;
  remoteApiConfig: Record<string, unknown> & { baseUrl?: string };
  generationProvider?: string | null;
  promptBundle: PromptBundleLike;
  mascotReferenceBankDiagnostics: MascotReferenceBankDiagnosticsLike;
  mascotReferenceBankReviewPlan: MascotReferenceBankReviewPlanLike;
  manifestPath: string;
  readGenerationQualityConfig: () => QualityConfigLike;
  readAutoRerouteConfig: () => Record<string, unknown>;
  evaluateBudget: (prisma: unknown, totalImages: number, limits: LimitsLike) => Promise<BudgetLike>;
  isMascotTargetStyle: (targetStyle: string | undefined) => boolean;
  toPositiveInt: (value: string | undefined, fallback: number) => number;
}): Promise<{
  requestedProvider: string;
  providerName: string;
  providerWarning: string | null;
  provider: ProviderLike;
  budget: BudgetLike;
  qualityConfig: QualityConfigLike;
  autoRerouteConfig: Record<string, unknown>;
  acceptedScoreThreshold: number;
  frontAnchorAcceptedScoreThreshold: number;
  allowLowQualityMockFallback: boolean;
  strictRealProvider: boolean;
  providerRequestTimeoutMs: number;
  providerStageTimeoutOverrideMs: number;
  candidatePostprocessTimeoutMs: number;
  candidateAnalysisTimeoutMs: number;
  autoRetryRounds: number;
  sequentialReferenceEnabled: boolean;
  candidatesDir: string;
}> {
  const requestedProvider =
    input.generationProvider ??
    (input.comfyUiUrl ? "comfyui" : input.remoteApiConfig.baseUrl ? "remoteApi" : "mock");

  let providerName = resolveProviderName({
    requestedProvider,
    comfyUiUrl: input.comfyUiUrl,
    remoteApiBaseUrl: input.remoteApiConfig.baseUrl
  });
  let providerWarning: string | null = null;

  if (input.mascotReferenceBankDiagnostics.status === "scaffold_only") {
    const reviewSlotsSummary =
      input.mascotReferenceBankReviewPlan.requiredManualSlots.length > 4
        ? `${input.mascotReferenceBankReviewPlan.requiredManualSlots.slice(0, 4).join(", ")} +${input.mascotReferenceBankReviewPlan.requiredManualSlots.length - 4} more`
        : input.mascotReferenceBankReviewPlan.requiredManualSlots.join(", ");
    const requiredAssetsSummary =
      input.mascotReferenceBankDiagnostics.requiredAssetSlots.length > 3
        ? `${input.mascotReferenceBankDiagnostics.requiredAssetSlots.slice(0, 3).join(", ")} +${input.mascotReferenceBankDiagnostics.requiredAssetSlots.length - 3} more`
        : input.mascotReferenceBankDiagnostics.requiredAssetSlots.join(", ");
    providerWarning =
      `${input.promptBundle.speciesId} reference bank is scaffold-only (missing roles: ${input.mascotReferenceBankDiagnostics.missingRoles.join(", ") || "none"}). ` +
      `${input.mascotReferenceBankDiagnostics.statusMismatch ? `Declared status ${input.mascotReferenceBankDiagnostics.declaredStatus} is being downgraded. ` : ""}` +
      `Review-only pack guidance applies${reviewSlotsSummary.length > 0 ? `; manual slots: ${reviewSlotsSummary}` : ""}` +
      `${requiredAssetsSummary.length > 0 ? `; required assets: ${requiredAssetsSummary}` : ""}.`;
  }

  if (requestedProvider === "comfyui" && !input.comfyUiUrl && input.remoteApiConfig.baseUrl) {
    providerWarning = [
      providerWarning,
      "COMFY_ADAPTER_URL/COMFYUI_BASE_URL is not configured. Falling back to remoteApi provider."
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  } else if (requestedProvider === "comfyui" && !input.comfyUiUrl) {
    providerName = "mock";
    providerWarning = [
      providerWarning,
      "COMFY_ADAPTER_URL/COMFYUI_BASE_URL is not configured. Falling back to mock provider."
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  } else if (requestedProvider === "remoteApi" && !input.remoteApiConfig.baseUrl) {
    providerName = "mock";
    providerWarning = [providerWarning, "IMAGEGEN_REMOTE_BASE_URL is not configured. Falling back to mock provider."]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  }

  const budget = await input.evaluateBudget(input.prisma, input.totalImages, input.limits);
  if (budget.wouldExceed) {
    if (input.limits.budgetFallbackToMock && providerName !== "mock") {
      providerWarning = `Budget exceeded (${budget.monthSpentUsd.toFixed(2)} / ${budget.monthBudgetUsd.toFixed(
        2
      )} USD). Falling back to mock provider.`;
      providerName = "mock";
    } else {
      throw new Error(
        `Image generation rejected by budget limit (monthSpent=${budget.monthSpentUsd.toFixed(
          2
        )}, estimatedRun=${budget.estimatedCostThisRunUsd.toFixed(2)}, budget=${budget.monthBudgetUsd.toFixed(2)})`
      );
    }
  }

  const provider = createCharacterProvider({
    provider: providerName as "comfyui" | "remoteApi" | "mock",
    comfyUiUrl: input.comfyUiUrl,
    remoteApi: {
      ...input.remoteApiConfig,
      maxRetries: input.limits.maxRetries,
      estimatedCostUsdPerImage: input.limits.costPerImageUsd
    }
  }) as ProviderLike;

  const qualityConfig = input.readGenerationQualityConfig();
  const autoRerouteConfig = input.readAutoRerouteConfig();
  const acceptedScoreThreshold = Math.max(
    qualityConfig.minAcceptedScore,
    input.promptBundle.selectionHints.minAcceptedScore ?? 0
  );
  const frontAnchorAcceptedScoreThreshold =
    typeof input.promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
      ? input.promptBundle.selectionHints.frontMasterMinAcceptedScore
      : acceptedScoreThreshold;
  const allowLowQualityMockFallback =
    qualityConfig.lowQualityFallbackToMock &&
    !input.isMascotTargetStyle(input.promptBundle.qualityProfile.targetStyle);
  const strictRealProvider =
    input.isMascotTargetStyle(input.promptBundle.qualityProfile.targetStyle) &&
    requestedProvider === "comfyui";
  const providerRequestTimeoutMs = input.toPositiveInt(process.env.COMFY_ADAPTER_TIMEOUT_MS, 360_000);
  const providerStageTimeoutOverrideMs = input.toPositiveInt(
    process.env.CHARACTER_PROVIDER_STAGE_TIMEOUT_MS,
    0
  );
  const candidatePostprocessTimeoutMs = input.toPositiveInt(
    process.env.CHARACTER_CANDIDATE_POSTPROCESS_TIMEOUT_MS,
    120_000
  );
  const candidateAnalysisTimeoutMs = input.toPositiveInt(
    process.env.CHARACTER_CANDIDATE_ANALYSIS_TIMEOUT_MS,
    120_000
  );
  const speciesRetryBonus = input.promptBundle.speciesId === "wolf" ? 1 : 0;
  const autoRetryRounds =
    Math.max(qualityConfig.autoRetryRounds, input.promptBundle.selectionHints.autoRetryRounds ?? 0) +
    speciesRetryBonus;
  const sequentialReferenceEnabled =
    (input.promptBundle.selectionHints.sequentialReference ?? qualityConfig.sequentialReference) === true;
  const candidatesDir = path.join(path.dirname(input.manifestPath), "candidates");
  fs.mkdirSync(candidatesDir, { recursive: true });

  return {
    requestedProvider,
    providerName,
    providerWarning,
    provider,
    budget,
    qualityConfig,
    autoRerouteConfig,
    acceptedScoreThreshold,
    frontAnchorAcceptedScoreThreshold,
    allowLowQualityMockFallback,
    strictRealProvider,
    providerRequestTimeoutMs,
    providerStageTimeoutOverrideMs,
    candidatePostprocessTimeoutMs,
    candidateAnalysisTimeoutMs,
    autoRetryRounds,
    sequentialReferenceEnabled,
    candidatesDir
  };
}

export async function runProviderGenerateWithFallback(input: {
  provider: ProviderLike;
  providerName: string;
  providerWarning: string | null;
  strictRealProvider: boolean;
  providerInput: CharacterProviderGenerateInput;
  isTransientProviderFailure: (error: unknown) => boolean;
  errorMessage: (error: unknown) => string;
}): Promise<{
  provider: ProviderLike;
  providerName: string;
  providerWarning: string | null;
  candidates: CharacterGenerationCandidate[];
  workflowHash: string;
  generatedAt: string;
  providerMeta?: Record<string, unknown>;
  callLogs: CharacterProviderCallLog[];
}> {
  try {
    const result = await input.provider.generate(input.providerInput);
    return {
      provider: input.provider,
      providerName: input.providerName,
      providerWarning: input.providerWarning,
      candidates: result.candidates,
      workflowHash: result.workflowHash,
      generatedAt: result.generatedAt,
      providerMeta: result.providerMeta,
      callLogs: Array.isArray(result.callLogs) ? result.callLogs : []
    };
  } catch (error) {
    if (input.providerName === "mock") {
      throw error;
    }

    const firstErrorSummary = input.errorMessage(error);
    if (input.isTransientProviderFailure(error)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        const retryResult = await input.provider.generate(input.providerInput);
        return {
          provider: input.provider,
          providerName: input.providerName,
          providerWarning: input.providerWarning
            ? `${input.providerWarning} | ${input.providerName} transient failure recovered after retry (${firstErrorSummary}).`
            : `${input.providerName} transient failure recovered after retry (${firstErrorSummary}).`,
          candidates: retryResult.candidates,
          workflowHash: retryResult.workflowHash,
          generatedAt: retryResult.generatedAt,
          providerMeta: retryResult.providerMeta,
          callLogs: Array.isArray(retryResult.callLogs) ? retryResult.callLogs : []
        };
      } catch (retryError) {
        if (input.strictRealProvider) {
          throw new Error(
            `${input.providerName} unavailable after retry (${firstErrorSummary}; retry=${input.errorMessage(retryError)})`
          );
        }
        error = retryError;
      }
    } else if (input.strictRealProvider) {
      throw error;
    }

    const fallbackProvider = createCharacterProvider({
      provider: "mock"
    }) as ProviderLike;
    const fallbackResult = await fallbackProvider.generate(input.providerInput);
    return {
      provider: fallbackProvider,
      providerName: "mock",
      providerWarning: `${input.providerName} unavailable (${input.errorMessage(error)}). Falling back to mock provider.`,
      candidates: fallbackResult.candidates,
      workflowHash: fallbackResult.workflowHash,
      generatedAt: fallbackResult.generatedAt,
      providerMeta: fallbackResult.providerMeta,
      callLogs: Array.isArray(fallbackResult.callLogs) ? fallbackResult.callLogs : []
    };
  }
}
