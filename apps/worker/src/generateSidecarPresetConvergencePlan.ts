import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

bootstrapEnv();

type BundleName = "economy" | "medical";

type ParsedPresetCandidate = {
  scenario: string | null;
  score: number | null;
  verdict: string | null;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
};

type ObservedCandidate = {
  name: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  sourceBundles: BundleName[];
  sourceTags: string[];
  sourceScenarios: string[];
  observedScores: number[];
  observedVerdicts: string[];
  observed: true;
};

type PlannedCandidate = {
  name: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  sourceBundles: BundleName[];
  sourceTags: string[];
  sourceScenarios: string[];
  observedScores: number[];
  observedVerdicts: string[];
  observed: boolean;
};

type CandidateAccumulator = {
  name: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  sourceBundles: Set<BundleName>;
  sourceTags: Set<string>;
  sourceScenarios: Set<string>;
  observedScores: number[];
  observedVerdicts: Set<string>;
  observed: boolean;
};

type MatrixLike = {
  fixture_path?: unknown;
  character_pack_id?: unknown;
  scenario_set?: unknown;
  recommendation_summary?: unknown;
  scenarios?: unknown;
};

type ScenarioFileArtifact = {
  schema_version: "1.0";
  generated_at: string;
  name: string;
  scenarios: Array<{
    name: string;
    controlnetPreset: SidecarControlNetPresetId;
    impactPreset: SidecarImpactPresetId;
    qcPreset: SidecarQcPresetId;
  }>;
};

type ConvergencePlanArtifact = {
  schema_version: "1.0";
  generated_at: string;
  source_matrices: {
    economy: string;
    medical: string;
  };
  source_scenario_sets: {
    economy: string | null;
    medical: string | null;
  };
  source_character_packs: {
    economy: string | null;
    medical: string | null;
  };
  strategy: {
    required_observed_keys: string[];
    priority_controlnets: SidecarControlNetPresetId[];
    priority_balanced_impacts: SidecarImpactPresetId[];
    max_candidates: number;
  };
  candidates: PlannedCandidate[];
  commands: {
    economy: string;
    medical: string;
  };
};

const CONTROLNET_PRESETS = new Set<SidecarControlNetPresetId>([
  "pose_depth_balance_v1",
  "pose_canny_balance_v1",
  "profile_lineart_depth_v1"
]);

const IMPACT_PRESETS = new Set<SidecarImpactPresetId>([
  "broadcast_cleanup_v1",
  "identity_repair_detail_v1",
  "soft_clarity_cleanup_v1",
  "soft_clarity_repair_v1"
]);

const QC_PRESETS = new Set<SidecarQcPresetId>(["broadcast_balanced_v1", "broadcast_identity_strict_v1"]);

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function resolveArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function isControlnetPreset(value: unknown): value is SidecarControlNetPresetId {
  return typeof value === "string" && CONTROLNET_PRESETS.has(value as SidecarControlNetPresetId);
}

function isImpactPreset(value: unknown): value is SidecarImpactPresetId {
  return typeof value === "string" && IMPACT_PRESETS.has(value as SidecarImpactPresetId);
}

function isQcPreset(value: unknown): value is SidecarQcPresetId {
  return typeof value === "string" && QC_PRESETS.has(value as SidecarQcPresetId);
}

function parsePresetCandidate(value: unknown): ParsedPresetCandidate | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  if (!isControlnetPreset(record.controlnet_preset)) {
    return null;
  }
  if (!isImpactPreset(record.impact_preset)) {
    return null;
  }
  if (!isQcPreset(record.qc_preset)) {
    return null;
  }
  return {
    scenario: asString(record.scenario),
    score: asFiniteNumber(record.score),
    verdict: asString(record.verdict),
    controlnetPreset: record.controlnet_preset,
    impactPreset: record.impact_preset,
    qcPreset: record.qc_preset
  };
}

function candidateKey(input: {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}): string {
  return `${input.controlnetPreset}__${input.impactPreset}__${input.qcPreset}`;
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function uniqueOrdered<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function addObservedCandidate(
  map: Map<string, CandidateAccumulator>,
  bundle: BundleName,
  candidate: ParsedPresetCandidate | null,
  tag: string
): void {
  if (!candidate) {
    return;
  }
  const key = candidateKey(candidate);
  const existing = map.get(key);
  const preferredName =
    candidate.scenario ??
    `observed_${sanitizeName(candidate.controlnetPreset)}__${sanitizeName(candidate.impactPreset)}__${sanitizeName(candidate.qcPreset)}`;
  if (!existing) {
    map.set(key, {
      name: preferredName,
      controlnetPreset: candidate.controlnetPreset,
      impactPreset: candidate.impactPreset,
      qcPreset: candidate.qcPreset,
      sourceBundles: new Set([bundle]),
      sourceTags: new Set([tag]),
      sourceScenarios: new Set(candidate.scenario ? [candidate.scenario] : []),
      observedScores: typeof candidate.score === "number" ? [candidate.score] : [],
      observedVerdicts: new Set(candidate.verdict ? [candidate.verdict] : []),
      observed: true
    });
    return;
  }
  existing.sourceBundles.add(bundle);
  existing.sourceTags.add(tag);
  if (candidate.scenario) {
    existing.sourceScenarios.add(candidate.scenario);
  }
  if (typeof candidate.score === "number") {
    existing.observedScores.push(candidate.score);
  }
  if (candidate.verdict) {
    existing.observedVerdicts.add(candidate.verdict);
  }
}

function collectSummaryCandidates(
  map: Map<string, CandidateAccumulator>,
  bundle: BundleName,
  matrix: MatrixLike,
  topScenariosPerBundle: number
): {
  bestOverall: ParsedPresetCandidate | null;
  bestBalanced: ParsedPresetCandidate | null;
  bestStrict: ParsedPresetCandidate | null;
} {
  const recommendationSummary = asRecord(matrix.recommendation_summary ?? null);
  const bestOverall = parsePresetCandidate(recommendationSummary?.best_overall);
  const bestBalanced = parsePresetCandidate(recommendationSummary?.best_balanced_qc);
  const bestStrict = parsePresetCandidate(recommendationSummary?.best_strict_qc);
  addObservedCandidate(map, bundle, bestOverall, `${bundle}:best_overall`);
  addObservedCandidate(map, bundle, bestBalanced, `${bundle}:best_balanced_qc`);
  addObservedCandidate(map, bundle, bestStrict, `${bundle}:best_strict_qc`);

  for (const [groupName, rawGroup] of [
    ["best_by_controlnet_preset", recommendationSummary?.best_by_controlnet_preset],
    ["best_by_impact_preset", recommendationSummary?.best_by_impact_preset],
    ["best_by_qc_preset", recommendationSummary?.best_by_qc_preset]
  ] as const) {
    const groupRecord = asRecord(rawGroup);
    if (!groupRecord) {
      continue;
    }
    for (const [groupKey, groupValue] of Object.entries(groupRecord)) {
      addObservedCandidate(map, bundle, parsePresetCandidate(groupValue), `${bundle}:${groupName}:${groupKey}`);
    }
  }

  const scenarios = Array.isArray(matrix.scenarios) ? matrix.scenarios : [];
  for (const rawScenario of scenarios.slice(0, topScenariosPerBundle)) {
    addObservedCandidate(map, bundle, parsePresetCandidate(rawScenario), `${bundle}:ranked_top`);
  }

  return {
    bestOverall,
    bestBalanced,
    bestStrict
  };
}

function toObservedCandidate(accumulator: CandidateAccumulator): ObservedCandidate {
  return {
    name: accumulator.name,
    controlnetPreset: accumulator.controlnetPreset,
    impactPreset: accumulator.impactPreset,
    qcPreset: accumulator.qcPreset,
    sourceBundles: [...accumulator.sourceBundles],
    sourceTags: [...accumulator.sourceTags],
    sourceScenarios: [...accumulator.sourceScenarios],
    observedScores: [...accumulator.observedScores],
    observedVerdicts: [...accumulator.observedVerdicts],
    observed: true
  };
}

function scoreObservedCandidate(candidate: ObservedCandidate): number {
  const sharedBundleBonus = candidate.sourceBundles.length > 1 ? 100 : 0;
  const tagDensityBonus = candidate.sourceTags.length * 3;
  const scoreBonus =
    candidate.observedScores.length > 0 ? Math.max(...candidate.observedScores.map((value) => Math.round(value * 10))) : 0;
  const balancedBonus = candidate.qcPreset === "broadcast_balanced_v1" ? 5 : 0;
  return sharedBundleBonus + tagDensityBonus + scoreBonus + balancedBonus;
}

function buildCrossoverCandidates(input: {
  observedMap: Map<string, CandidateAccumulator>;
  priorityControlnets: SidecarControlNetPresetId[];
  priorityBalancedImpacts: SidecarImpactPresetId[];
}): PlannedCandidate[] {
  const planned: PlannedCandidate[] = [];
  for (const controlnetPreset of input.priorityControlnets) {
    for (const impactPreset of input.priorityBalancedImpacts) {
      const qcPreset: SidecarQcPresetId = "broadcast_balanced_v1";
      const key = candidateKey({
        controlnetPreset,
        impactPreset,
        qcPreset
      });
      if (input.observedMap.has(key)) {
        continue;
      }
      planned.push({
        name: `convergence_${sanitizeName(controlnetPreset)}__${sanitizeName(impactPreset)}__balanced`,
        controlnetPreset,
        impactPreset,
        qcPreset,
        sourceBundles: [],
        sourceTags: ["generated:crossover_balanced"],
        sourceScenarios: [],
        observedScores: [],
        observedVerdicts: [],
        observed: false
      });
    }
  }
  return planned;
}

function quotePowerShell(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildBenchmarkCommand(input: {
  bundle: BundleName;
  fixturePath: string;
  outDir: string;
  characterPackId: string;
  scenarioFilePath: string;
}): string {
  return [
    "pnpm -C apps/worker run benchmark:video-i2v-presets --",
    `--fixture=${quotePowerShell(input.fixturePath)}`,
    `--out-dir=${quotePowerShell(input.outDir)}`,
    `--character-pack-id=${quotePowerShell(input.characterPackId)}`,
    `--profile-bundle=${input.bundle}`,
    `--scenario-file=${quotePowerShell(input.scenarioFilePath)}`
  ].join(" ");
}

function buildMarkdown(plan: ConvergencePlanArtifact, scenarioFilePath: string): string {
  const lines = [
    "# Sidecar Preset Convergence Plan",
    "",
    `- Generated At: \`${plan.generated_at}\``,
    `- Economy Matrix: \`${plan.source_matrices.economy}\``,
    `- Medical Matrix: \`${plan.source_matrices.medical}\``,
    `- Scenario File: \`${scenarioFilePath}\``,
    `- Max Candidates: \`${plan.strategy.max_candidates}\``,
    `- Priority Controlnets: \`${plan.strategy.priority_controlnets.join(",")}\``,
    `- Priority Balanced Impacts: \`${plan.strategy.priority_balanced_impacts.join(",")}\``,
    "",
    "## Commands",
    "",
    "```powershell",
    plan.commands.economy,
    plan.commands.medical,
    "```",
    "",
    "## Candidates",
    ""
  ];

  for (const candidate of plan.candidates) {
    lines.push(`### ${candidate.name}`);
    lines.push("");
    lines.push(
      `- Triplet: \`${candidate.controlnetPreset} / ${candidate.impactPreset} / ${candidate.qcPreset}\``
    );
    lines.push(`- Observed: \`${candidate.observed}\``);
    lines.push(`- Source Bundles: \`${candidate.sourceBundles.join(",") || "generated"}\``);
    lines.push(`- Source Tags: \`${candidate.sourceTags.join("|") || "generated"}\``);
    lines.push(`- Source Scenarios: \`${candidate.sourceScenarios.join("|") || "n/a"}\``);
    lines.push(
      `- Observed Scores: \`${candidate.observedScores.length > 0 ? candidate.observedScores.join(",") : "n/a"}\``
    );
    lines.push(
      `- Observed Verdicts: \`${candidate.observedVerdicts.length > 0 ? candidate.observedVerdicts.join(",") : "n/a"}\``
    );
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const repoRoot = resolveRepoRoot();
  const economyMatrixPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("economy-matrix") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "economy", "preset_benchmark_matrix.json")
  );
  const medicalMatrixPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("medical-matrix") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "medical", "preset_benchmark_matrix.json")
  );
  const outRoot = resolveLocalPath(
    repoRoot,
    resolveArgValue("out-dir") ?? path.join("out", "multi_channel_benchmarks", "video_i2v")
  );
  const scenarioFilePath = resolveLocalPath(
    repoRoot,
    resolveArgValue("scenario-file-out") ?? path.join(outRoot, "preset_convergence_scenarios.json")
  );
  const planPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("out") ?? path.join(outRoot, "preset_convergence_plan.json")
  );
  const markdownPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("md-out") ?? path.join(outRoot, "preset_convergence_plan.md")
  );
  const maxCandidatesRaw = Number.parseInt(resolveArgValue("max-candidates") ?? "12", 10);
  const topScenariosPerBundleRaw = Number.parseInt(resolveArgValue("top-scenarios-per-bundle") ?? "2", 10);
  const maxCandidates = Number.isFinite(maxCandidatesRaw) && maxCandidatesRaw > 0 ? maxCandidatesRaw : 12;
  const topScenariosPerBundle =
    Number.isFinite(topScenariosPerBundleRaw) && topScenariosPerBundleRaw > 0 ? topScenariosPerBundleRaw : 2;

  if (!fs.existsSync(economyMatrixPath)) {
    throw new Error(`economy matrix not found: ${economyMatrixPath}`);
  }
  if (!fs.existsSync(medicalMatrixPath)) {
    throw new Error(`medical matrix not found: ${medicalMatrixPath}`);
  }

  const economyMatrix = readJson(economyMatrixPath) as MatrixLike;
  const medicalMatrix = readJson(medicalMatrixPath) as MatrixLike;
  const observedMap = new Map<string, CandidateAccumulator>();
  const economySummary = collectSummaryCandidates(observedMap, "economy", economyMatrix, topScenariosPerBundle);
  const medicalSummary = collectSummaryCandidates(observedMap, "medical", medicalMatrix, topScenariosPerBundle);

  const observedCandidates = Array.from(observedMap.values()).map((entry) => toObservedCandidate(entry));
  const observedByPriority = [...observedCandidates].sort(
    (left, right) => scoreObservedCandidate(right) - scoreObservedCandidate(left)
  );

  const requiredObservedKeys = uniqueOrdered(
    [
      economySummary.bestOverall,
      medicalSummary.bestOverall,
      economySummary.bestStrict,
      medicalSummary.bestStrict
    ]
      .filter((entry): entry is ParsedPresetCandidate => Boolean(entry))
      .map((entry) => candidateKey(entry))
  );

  const priorityControlnets = uniqueOrdered(
    [
      economySummary.bestOverall?.controlnetPreset,
      medicalSummary.bestOverall?.controlnetPreset,
      ...observedByPriority
        .filter((entry) => entry.qcPreset === "broadcast_balanced_v1")
        .map((entry) => entry.controlnetPreset)
    ].filter((entry): entry is SidecarControlNetPresetId => Boolean(entry))
  ).slice(0, 3);
  const priorityBalancedImpacts = uniqueOrdered(
    [
      economySummary.bestOverall?.impactPreset,
      medicalSummary.bestOverall?.impactPreset,
      ...observedByPriority
        .filter((entry) => entry.qcPreset === "broadcast_balanced_v1")
        .map((entry) => entry.impactPreset)
    ].filter((entry): entry is SidecarImpactPresetId => Boolean(entry))
  ).slice(0, 3);

  const crossoverCandidates = buildCrossoverCandidates({
    observedMap,
    priorityControlnets,
    priorityBalancedImpacts
  });

  const finalCandidates: PlannedCandidate[] = [];
  const emittedKeys = new Set<string>();
  const pushCandidate = (candidate: PlannedCandidate) => {
    if (finalCandidates.length >= maxCandidates) {
      return;
    }
    const key = candidateKey(candidate);
    if (emittedKeys.has(key)) {
      return;
    }
    emittedKeys.add(key);
    finalCandidates.push(candidate);
  };

  for (const key of requiredObservedKeys) {
    const candidate = observedByPriority.find((entry) => candidateKey(entry) === key);
    if (candidate) {
      pushCandidate(candidate);
    }
  }
  for (const candidate of observedByPriority) {
    pushCandidate(candidate);
  }
  for (const candidate of crossoverCandidates) {
    pushCandidate(candidate);
  }

  const scenarioFileArtifact: ScenarioFileArtifact = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    name: "preset_convergence_candidates_v1",
    scenarios: finalCandidates.map((candidate) => ({
      name: candidate.name,
      controlnetPreset: candidate.controlnetPreset,
      impactPreset: candidate.impactPreset,
      qcPreset: candidate.qcPreset
    }))
  };

  const economyFixturePath = asString(economyMatrix.fixture_path) ?? path.join(repoRoot, "scripts", "fixtures", "video_i2v_smoke_economy_shots.json");
  const medicalFixturePath = asString(medicalMatrix.fixture_path) ?? path.join(repoRoot, "scripts", "fixtures", "video_i2v_smoke_medical_shots.json");
  const economyCharacterPackId =
    resolveArgValue("economy-character-pack-id") ??
    asString(economyMatrix.character_pack_id) ??
    "<economy-pack-id>";
  const medicalCharacterPackId =
    resolveArgValue("medical-character-pack-id") ??
    asString(medicalMatrix.character_pack_id) ??
    "<medical-pack-id>";
  const economyOutDir = path.join(outRoot, "economy_convergence");
  const medicalOutDir = path.join(outRoot, "medical_convergence");

  const planArtifact: ConvergencePlanArtifact = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source_matrices: {
      economy: economyMatrixPath,
      medical: medicalMatrixPath
    },
    source_scenario_sets: {
      economy: asString(economyMatrix.scenario_set),
      medical: asString(medicalMatrix.scenario_set)
    },
    source_character_packs: {
      economy: asString(economyMatrix.character_pack_id),
      medical: asString(medicalMatrix.character_pack_id)
    },
    strategy: {
      required_observed_keys: requiredObservedKeys,
      priority_controlnets: priorityControlnets,
      priority_balanced_impacts: priorityBalancedImpacts,
      max_candidates: maxCandidates
    },
    candidates: finalCandidates,
    commands: {
      economy: buildBenchmarkCommand({
        bundle: "economy",
        fixturePath: economyFixturePath,
        outDir: economyOutDir,
        characterPackId: economyCharacterPackId,
        scenarioFilePath
      }),
      medical: buildBenchmarkCommand({
        bundle: "medical",
        fixturePath: medicalFixturePath,
        outDir: medicalOutDir,
        characterPackId: medicalCharacterPackId,
        scenarioFilePath
      })
    }
  };

  writeJson(scenarioFilePath, scenarioFileArtifact);
  writeJson(planPath, planArtifact);
  ensureDir(path.dirname(markdownPath));
  fs.writeFileSync(markdownPath, buildMarkdown(planArtifact, scenarioFilePath), "utf8");

  console.log(`SIDECAR PRESET CONVERGENCE SCENARIOS: ${scenarioFilePath}`);
  console.log(`SIDECAR PRESET CONVERGENCE PLAN: ${planPath}`);
  console.log(`SIDECAR PRESET CONVERGENCE MARKDOWN: ${markdownPath}`);
  console.log(`SIDECAR PRESET CONVERGENCE COUNT: ${finalCandidates.length}`);
}

try {
  main();
} catch (error) {
  console.error(
    `generateSidecarPresetConvergencePlan FAIL: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
