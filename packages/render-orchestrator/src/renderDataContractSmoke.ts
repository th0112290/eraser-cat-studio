import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "./orchestrateRender";
import type { RenderableShotsDocument } from "./types";

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "../../..");
}

function resolveDemoFixturePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "../fixtures/demo-shots.json");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildChartBoundDocument(): RenderableShotsDocument {
  const fixture = readJson<RenderableShotsDocument>(resolveDemoFixturePath());
  const shot = fixture.shots[0];
  return {
    ...fixture,
    shots: [
      {
        ...shot,
        chart: {
          chart_id: "chart_001",
          type: "bar",
          dataset_id: "macro_series",
          time_range: "full",
          layout_preset: "main_left",
          callouts: [
            {
              f: 0,
              text: "Macro series"
            }
          ]
        }
      }
    ]
  };
}

async function expectMissingDataFailure(repoRoot: string): Promise<void> {
  const scenarioDir = path.join(repoRoot, "out", "tmp", "render_data_contract_smoke", "missing_data");
  fs.rmSync(scenarioDir, { recursive: true, force: true });
  fs.mkdirSync(scenarioDir, { recursive: true });
  const shotsPath = path.join(scenarioDir, "shots.json");
  const outputPath = path.join(scenarioDir, "render_episode.mp4");
  writeJson(shotsPath, buildChartBoundDocument());

  let failed = false;
  try {
    await orchestrateRenderEpisode({
      dryRun: true,
      shotsPath,
      outputPath
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("declares dataset binding")) {
      failed = true;
    } else {
      throw error;
    }
  }

  if (!failed) {
    throw new Error("Expected dataset-bound render to fail without resolved rows.");
  }
}

async function expectEpisodeRowsSuccess(repoRoot: string): Promise<void> {
  const scenarioDir = path.join(repoRoot, "out", "tmp", "render_data_contract_smoke", "episode_rows");
  fs.rmSync(scenarioDir, { recursive: true, force: true });
  fs.mkdirSync(scenarioDir, { recursive: true });
  const shotsPath = path.join(scenarioDir, "shots.json");
  const outputPath = path.join(scenarioDir, "render_episode.mp4");
  const doc = buildChartBoundDocument();
  doc.episode = {
    ...doc.episode,
    data_inputs: [
      {
        dataset_id: "macro_series",
        unit: "%",
        rows: [
          { label: "Q1", value: 12, unit: "%" },
          { label: "Q2", value: 18, unit: "%" },
          { label: "Q3", value: 21, unit: "%" }
        ]
      }
    ]
  };
  writeJson(shotsPath, doc);

  await orchestrateRenderEpisode({
    dryRun: true,
    shotsPath,
    outputPath
  });

  const props = readJson<{ sequences: Array<{ chartData?: Array<{ label: string; value: number }> }> }>(
    path.join(scenarioDir, "render_episode.props.json")
  );
  const chartData = props.sequences[0]?.chartData ?? [];
  if (chartData.length !== 3 || chartData[0]?.label !== "Q1" || chartData[2]?.value !== 21) {
    throw new Error(`Expected render props to preserve bound dataset rows, got ${JSON.stringify(chartData)}`);
  }
}

async function expectUnboundSyntheticSuccess(repoRoot: string): Promise<void> {
  const scenarioDir = path.join(repoRoot, "out", "tmp", "render_data_contract_smoke", "unbound_synthetic");
  fs.rmSync(scenarioDir, { recursive: true, force: true });
  fs.mkdirSync(scenarioDir, { recursive: true });
  const shotsPath = path.join(scenarioDir, "shots.json");
  const outputPath = path.join(scenarioDir, "render_episode.mp4");
  const doc = buildChartBoundDocument();
  if (doc.shots[0].chart) {
    delete doc.shots[0].chart.dataset_id;
  }
  writeJson(shotsPath, doc);

  await orchestrateRenderEpisode({
    dryRun: true,
    shotsPath,
    outputPath
  });

  const props = readJson<{ sequences: Array<{ chartData?: Array<{ label: string }> }> }>(
    path.join(scenarioDir, "render_episode.props.json")
  );
  const labels = (props.sequences[0]?.chartData ?? []).map((row) => row.label);
  if (labels.join(",") !== "A,B,C,D") {
    throw new Error(`Expected unbound chart shot to use synthetic fallback rows, got ${JSON.stringify(labels)}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  await expectMissingDataFailure(repoRoot);
  await expectEpisodeRowsSuccess(repoRoot);
  await expectUnboundSyntheticSuccess(repoRoot);
  console.log("render:data-contract:smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
