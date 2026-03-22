// @ts-nocheck

import { runProviderGenerateWithFallback } from "./characterGenerationProviderRuntime";
import { initializeGenerationStageRuntime } from "./characterGenerationStageRuntime";

export function initializeGenerationExecutionRuntime(input: any) {
  let providerName = input.providerName;
  let providerWarning = input.providerWarning;
  let provider = input.provider;
  let starterReferencePathsByView = input.starterReferencePathsByView;
  let preferredSelectionByView = input.preferredSelectionByView ?? {};
  let autoRerouteDiagnostics = input.autoRerouteDiagnostics;
  const providerCallLogs = [];
  let providerWorkflowHash = "unknown_workflow";
  let providerGeneratedAt = new Date().toISOString();
  let providerRunMeta;

  const runProviderGenerate = async (providerInput: any) => {
    const result = await runProviderGenerateWithFallback({
      provider,
      providerName,
      providerWarning,
      strictRealProvider: input.strictRealProvider,
      providerInput,
      isTransientProviderFailure: input.isTransientProviderFailure,
      errorMessage: input.errorMessage
    });
    provider = result.provider;
    providerName = result.providerName;
    providerWarning = result.providerWarning;
    providerWorkflowHash = result.workflowHash;
    providerGeneratedAt = result.generatedAt;
    providerRunMeta = result.providerMeta;
    providerCallLogs.push(...result.callLogs);
    return result.candidates;
  };

  const runtimeState = {
    get providerName() {
      return providerName;
    },
    set providerName(value: any) {
      providerName = value;
    },
    get providerWarning() {
      return providerWarning;
    },
    set providerWarning(value: any) {
      providerWarning = value;
    },
    get provider() {
      return provider;
    },
    set provider(value: any) {
      provider = value;
    },
    get starterReferencePathsByView() {
      return starterReferencePathsByView;
    },
    set starterReferencePathsByView(value: any) {
      starterReferencePathsByView = value;
    },
    get preferredSelectionByView() {
      return preferredSelectionByView;
    },
    set preferredSelectionByView(value: any) {
      preferredSelectionByView = value;
    },
    get autoRerouteDiagnostics() {
      return autoRerouteDiagnostics;
    },
    set autoRerouteDiagnostics(value: any) {
      autoRerouteDiagnostics = value;
    }
  };

  const stageRuntime = initializeGenerationStageRuntime({
    ...input.stageRuntimeInput,
    workflowStageRuns: input.workflowStageRuns,
    runtimeState,
    runProviderGenerate
  });

  return {
    runtimeState,
    providerCallLogs,
    getSnapshot() {
      return {
        providerName,
        providerWarning,
        provider,
        starterReferencePathsByView,
        preferredSelectionByView,
        autoRerouteDiagnostics,
        providerWorkflowHash,
        providerGeneratedAt,
        providerRunMeta
      };
    },
    ...stageRuntime
  };
}
