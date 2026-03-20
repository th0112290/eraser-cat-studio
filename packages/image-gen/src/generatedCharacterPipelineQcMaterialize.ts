import path from "node:path";
import type {
  CharacterPipelineAcceptanceStatus,
  CharacterPipelineQcCheck,
  CharacterPipelineQcReport,
  CharacterPipelineReferenceBankStatus,
  CharacterPipelineRepairAction,
  CharacterPipelineRepairTask,
  GeneratedCharacterManifest
} from "./generatedCharacterPipeline";

type CharacterPipelineRepairDocument = {
  schema_version: "1.0";
  generated_at: string;
  character_id: string;
  acceptance_status: CharacterPipelineAcceptanceStatus;
  tasks: CharacterPipelineRepairTask[];
};

type AcceptanceSummary = {
  status: CharacterPipelineAcceptanceStatus;
  errorCount: number;
  warningCount: number;
  blockerCount: number;
  blockingCheckCodes: string[];
};

export function materializeCharacterPipelineQcArtifacts(input: {
  characterId: string;
  manifest: GeneratedCharacterManifest;
  checks: CharacterPipelineQcCheck[];
  referenceBank: CharacterPipelineReferenceBankStatus;
  deps: {
    characterRootDir: (characterId: string) => string;
    writeJson: (filePath: string, value: unknown) => void;
    saveManifest: (manifest: GeneratedCharacterManifest) => void;
    resolveAcceptanceFromChecks: (checks: CharacterPipelineQcCheck[]) => AcceptanceSummary;
    repairActionForCode: (code: string) => CharacterPipelineRepairAction;
  };
}): {
  reportPath: string;
  repairTasksPath: string;
  passed: boolean;
  acceptanceStatus: CharacterPipelineAcceptanceStatus;
} {
  const acceptance = input.deps.resolveAcceptanceFromChecks(input.checks);
  const passed = acceptance.errorCount === 0;
  const generatedAt = new Date().toISOString();
  const report: CharacterPipelineQcReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    character_id: input.characterId,
    approved_front_master_present: Boolean(input.manifest.approved_front_master),
    checks: input.checks,
    passed,
    acceptance_status: acceptance.status,
    error_count: acceptance.errorCount,
    warning_count: acceptance.warningCount,
    blocker_count: acceptance.blockerCount,
    blocking_check_codes: acceptance.blockingCheckCodes,
    reference_bank: input.referenceBank
  };
  const repairTasks: CharacterPipelineRepairDocument = {
    schema_version: "1.0",
    generated_at: generatedAt,
    character_id: input.characterId,
    acceptance_status: acceptance.status,
    tasks: input.checks
      .filter((entry): entry is CharacterPipelineQcCheck & { severity: "WARN" | "ERROR" } => !entry.passed && entry.severity !== "INFO")
      .map(
        (entry): CharacterPipelineRepairTask => ({
          code: entry.code,
          severity: entry.severity,
          action: input.deps.repairActionForCode(entry.code),
          reason: entry.message,
          asset_paths: entry.asset_paths,
          status: "open"
        })
      )
  };
  const reportPath = path.join(input.deps.characterRootDir(input.characterId), "qc", "qc_report.json");
  const repairTasksPath = path.join(input.deps.characterRootDir(input.characterId), "qc", "repair_tasks.json");
  input.deps.writeJson(reportPath, report);
  input.deps.writeJson(repairTasksPath, repairTasks);
  input.manifest.qc = {
    report_path: reportPath,
    repair_tasks_path: repairTasksPath,
    passed,
    generated_at: generatedAt,
    acceptance_status: acceptance.status,
    blocker_count: acceptance.blockerCount,
    error_count: acceptance.errorCount,
    warning_count: acceptance.warningCount,
    reference_bank: input.referenceBank
  };
  input.manifest.acceptance = {
    status: acceptance.status,
    accepted: acceptance.status === "accepted",
    updated_at: generatedAt,
    report_path: reportPath,
    repair_tasks_path: repairTasksPath,
    blocking_check_codes: acceptance.blockingCheckCodes,
    repair_task_count: repairTasks.tasks.length,
    reference_bank: input.referenceBank
  };
  input.deps.saveManifest(input.manifest);
  return {
    reportPath,
    repairTasksPath,
    passed,
    acceptanceStatus: acceptance.status
  };
}
