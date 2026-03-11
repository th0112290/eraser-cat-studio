import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileShots, generateBeats, toShotsDocument, type Shot, type StoryInput } from "@ec/story";
import { orchestrateRenderEpisode } from "./orchestrateRender";
import { resolveDeterministicProfileSeam } from "./profileSeam";
import type {
  DeterministicProfileResolver,
  EpisodeRenderProps,
  RenderProfileResolverSummary,
  VisualQcReport
} from "./types";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertPass(condition: boolean, label: string): void {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}`);
  if (!condition) {
    throw new Error(label);
  }
}

function resolveSmokeOutDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../out/profile_bundle_smoke");
}

function shortenText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return value;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function sanitizeSmokeShots(shots: Shot[]): Shot[] {
  return shots.map((shot, index) => {
    const anchorX = 0.2 + (index % 3) * 0.025;
    const anchorY = 0.46 + (index % 2) * 0.015;
    const talkText = shortenText(shot.talk_text, 112);
    return {
      ...shot,
      talk_text: talkText,
      visual_objects: shot.visual_objects?.map((visualObject) => ({
        ...visualObject,
        title: shortenText(visualObject.title, 34),
        body: shortenText(visualObject.body ?? talkText, 120),
        items: visualObject.items?.slice(0, 4).map((item) => shortenText(item, 28) ?? item)
      })),
      character: {
        ...shot.character,
        layer: "between_bg_mid_and_near",
        transform: {
          ...shot.character.transform,
          x: anchorX,
          y: anchorY,
          scale: Math.min(0.9, shot.character.transform.scale),
          flip_x: false
        },
        tracks: {
          ...shot.character.tracks,
          pos_path: shot.character.tracks.pos_path.map((point) => ({
            ...point,
            x: anchorX,
            y: anchorY
          })),
          point_track: undefined
        }
      }
    };
  });
}

async function runScenario(
  scenarioId: string,
  storyInput: StoryInput,
  profileResolver?: DeterministicProfileResolver,
  profileResolverModulePath?: string
): Promise<{ props: EpisodeRenderProps; qcReport: VisualQcReport; renderLogSummary?: RenderProfileResolverSummary }> {
  const scenarioDir = path.join(resolveSmokeOutDir(), scenarioId);
  const shots = sanitizeSmokeShots(compileShots(generateBeats(storyInput)));
  const shotsDoc = toShotsDocument(storyInput.episode, shots);
  const shotsPath = path.join(scenarioDir, "shots.json");
  writeJson(shotsPath, shotsDoc);

  const result = await orchestrateRenderEpisode({
    dryRun: true,
    shotsPath,
    outputPath: path.join(scenarioDir, "render_episode.mp4"),
    srtPath: path.join(scenarioDir, "render_episode.srt"),
    qcReportPath: path.join(scenarioDir, "qc_report.json"),
    renderLogPath: path.join(scenarioDir, "render_log.json"),
    qc: {
      minFontSizePx: 20,
      expectOcclusion: false
    },
    profileResolver,
    profileResolverModulePath,
    debugOverlay: {
      enabled: true,
      sourceLabel: `profile-bundle-smoke:${scenarioId}`
    }
  });

  return {
    props: readJson<EpisodeRenderProps>(result.propsPath),
    qcReport: readJson<VisualQcReport>(result.qcReportPath),
    renderLogSummary: result.profileResolver
  };
}

function issueCarriesProfileDetails(qcReport: VisualQcReport): boolean {
  return qcReport.runs.some((run) =>
    run.issues.some(
      (issue) =>
        typeof issue.details?.channelProfileId === "string" &&
        typeof issue.details?.mascotProfileId === "string" &&
        typeof issue.details?.layoutBias === "string"
    )
  );
}

function validateEconomyScenario(
  props: EpisodeRenderProps,
  qcReport: VisualQcReport,
  renderLogSummary?: RenderProfileResolverSummary,
  expectedModulePath?: string
): void {
  const sequences = props.sequences;
  assertPass(
    props.debugOverlay?.profileResolver?.resolverSources.includes("profiles_package") === true &&
      props.debugOverlay?.profileResolver?.resolverIds.includes("profiles_package_live_v1") === true,
    "economy profile smoke exposes profiles package resolver summary in debug overlay"
  );
  assertPass(
    renderLogSummary?.resolverSources.includes("profiles_package") === true &&
      renderLogSummary?.resolverIds.includes("profiles_package_live_v1") === true,
    "economy profile smoke exposes profiles package resolver summary in render log"
  );
  assertPass(
    expectedModulePath == null ||
      (props.debugOverlay?.profileResolver?.resolverModulePaths.includes(expectedModulePath) === true &&
        renderLogSummary?.resolverModulePaths.includes(expectedModulePath) === true),
    "economy profile smoke keeps live profiles module path in overlay and render log"
  );
  assertPass(sequences.length > 0, "economy profile smoke emitted sequences");
  assertPass(
    sequences.every((sequence) => sequence.profileBundle != null),
    "economy profile smoke emits profile bundles on every sequence"
  );
  assertPass(
    sequences.every((sequence) => sequence.characterPackId === "eraser-cat-minimal" && sequence.mascotId === "eraser_cat"),
    "economy profile smoke keeps eraser_cat runtime routing"
  );
  assertPass(
    sequences.every(
      (sequence) =>
        sequence.profileBundle?.resolverId === "profiles_package_live_v1" &&
        sequence.profileBundle?.resolverSource === "profiles_package" &&
        sequence.profileBundle?.studioProfileId === "studio_default"
    ),
    "economy profile smoke uses live studio profile package"
  );
  assertPass(
    sequences.every((sequence) => sequence.profileBundle?.mascotProfileId === "eraser_cat"),
    "economy profile smoke uses live eraser_cat mascot profile"
  );
  assertPass(
    sequences.every((sequence) => sequence.profileBundle?.finishBias === sequence.finishProfile?.tone),
    "economy profile smoke keeps finish bias aligned with finish profile"
  );
  assertPass(
    sequences.every(
      (sequence) =>
        sequence.profileBundle?.channelProfileId === "economy_channel" &&
        sequence.profileBundle.actingBias === "analytic_presenter" &&
        sequence.finishProfile?.tone === "economy_crisp"
    ),
    "economy profile smoke emits live economy analytic presenter sequences"
  );
  assertPass(
    sequences.some(
      (sequence) =>
        sequence.primaryVisualKind === "comparison_board" &&
        sequence.profileBundle?.layoutBias === "data_dense" &&
        sequence.profileBundle?.pointerBias === "chart_precise"
    ),
    "economy profile smoke keeps comparison boards on dense precise layout bias"
  );
  assertPass(
    issueCarriesProfileDetails(qcReport),
    "economy profile smoke propagates profile details into QC issues"
  );
}

function validateLocalSeamScenario(
  props: EpisodeRenderProps,
  renderLogSummary?: RenderProfileResolverSummary
): void {
  const sequences = props.sequences;
  assertPass(
    props.debugOverlay?.profileResolver?.resolverSources.includes("local_seam") === true &&
      props.debugOverlay?.profileResolver?.resolverIds.includes("local_profile_seam_v1") === true,
    "local seam profile smoke exposes local resolver summary in debug overlay"
  );
  assertPass(
    renderLogSummary?.resolverSources.includes("local_seam") === true &&
      renderLogSummary?.resolverIds.includes("local_profile_seam_v1") === true,
    "local seam profile smoke exposes local resolver summary in render log"
  );
  assertPass(
    sequences.length > 0 &&
      sequences.every(
        (sequence) =>
          sequence.profileBundle?.resolverId === "local_profile_seam_v1" &&
          sequence.profileBundle?.resolverSource === "local_seam"
      ),
    "local seam profile smoke keeps fallback seam alive"
  );
}

function validateMedicalScenario(
  props: EpisodeRenderProps,
  qcReport: VisualQcReport,
  renderLogSummary?: RenderProfileResolverSummary,
  expectedModulePath?: string
): void {
  const sequences = props.sequences;
  assertPass(
    props.debugOverlay?.profileResolver?.channelProfileIds.includes("medical_channel") === true,
    "medical profile smoke exposes live medical resolver summary in debug overlay"
  );
  assertPass(
    renderLogSummary?.channelProfileIds.includes("medical_channel") === true,
    "medical profile smoke exposes live medical resolver summary in render log"
  );
  assertPass(
    expectedModulePath == null ||
      (props.debugOverlay?.profileResolver?.resolverModulePaths.includes(expectedModulePath) === true &&
        renderLogSummary?.resolverModulePaths.includes(expectedModulePath) === true),
    "medical profile smoke keeps live profiles module path in overlay and render log"
  );
  assertPass(sequences.length > 0, "medical profile smoke emitted sequences");
  assertPass(
    sequences.every((sequence) => sequence.profileBundle != null),
    "medical profile smoke emits profile bundles on every sequence"
  );
  assertPass(
    sequences.every((sequence) => sequence.characterPackId === "med-dog-minimal" && sequence.mascotId === "med_dog"),
    "medical profile smoke keeps med_dog runtime routing"
  );
  assertPass(
    sequences.every(
      (sequence) =>
        sequence.profileBundle?.resolverSource === "profiles_package" &&
        sequence.profileBundle?.resolverId === "profiles_package_live_v1" &&
        sequence.profileBundle?.channelProfileId === "medical_channel" &&
        sequence.profileBundle?.mascotProfileId === "med_dog" &&
        sequence.profileBundle?.actingBias === "warm_guide"
    ),
    "medical profile smoke uses live medical channel and med_dog profiles"
  );
  assertPass(
    sequences.every(
      (sequence) =>
        sequence.profileBundle?.finishBias === "medical_soft" && sequence.finishProfile?.tone === "medical_soft"
    ),
    "medical profile smoke keeps medical finish soft across sequences"
  );
  assertPass(
    sequences.some(
      (sequence) =>
        sequence.primaryVisualKind === "labeled_diagram" &&
        sequence.profileBundle?.layoutBias === "guided_soft" &&
        sequence.profileBundle?.pointerBias === "guided_callout"
    ),
    "medical profile smoke emits guided diagram sequences"
  );
  assertPass(
    issueCarriesProfileDetails(qcReport),
    "medical profile smoke propagates profile details into QC issues"
  );
}

function validateInjectedResolverScenario(
  props: EpisodeRenderProps,
  renderLogSummary?: RenderProfileResolverSummary
): void {
  const sequences = props.sequences;
  assertPass(
    props.debugOverlay?.profileResolver?.resolverSources.includes("injected") === true &&
      props.debugOverlay?.profileResolver?.resolverIds.includes("injected_profile_resolver_smoke_v1") === true,
    "injected profile resolver summary is visible in debug overlay"
  );
  assertPass(
    renderLogSummary?.resolverSources.includes("injected") === true &&
      renderLogSummary?.resolverIds.includes("injected_profile_resolver_smoke_v1") === true,
    "injected profile resolver summary is visible in render log"
  );
  assertPass(
    sequences.length > 0 &&
      sequences.every(
        (sequence) =>
          sequence.profileBundle?.resolverId === "injected_profile_resolver_smoke_v1" &&
          sequence.profileBundle?.resolverSource === "injected" &&
          sequence.profileBundle?.studioProfileId === "injected_studio_profile_v1"
      ),
    "injected profile resolver overrides studio profile id"
  );
  assertPass(
    sequences.every((sequence) => sequence.profileBundle?.channelProfileId === "injected_channel_profile_v1"),
    "injected profile resolver overrides channel profile id"
  );
}

function validateProfilesPackageAdapterScenario(
  props: EpisodeRenderProps,
  renderLogSummary?: RenderProfileResolverSummary,
  expectedModulePath?: string,
  expectedResolverId = "profiles_package_module_stub_v1",
  expectedStudioProfileId = "profiles_package_studio_v1"
): void {
  const sequences = props.sequences;
  assertPass(
    props.debugOverlay?.profileResolver?.resolverSources.includes("profiles_package") === true &&
      props.debugOverlay?.profileResolver?.resolverIds.includes(expectedResolverId) === true,
    "profiles package adapter summary is visible in debug overlay"
  );
  assertPass(
    renderLogSummary?.resolverSources.includes("profiles_package") === true &&
      renderLogSummary?.resolverIds.includes(expectedResolverId) === true,
    "profiles package adapter summary is visible in render log"
  );
  assertPass(
    expectedModulePath == null ||
      (props.debugOverlay?.profileResolver?.resolverModulePaths.includes(expectedModulePath) === true &&
        renderLogSummary?.resolverModulePaths.includes(expectedModulePath) === true),
    "profiles package adapter keeps resolver module path in overlay and render log"
  );
  assertPass(
    sequences.length > 0 &&
      sequences.every(
        (sequence) =>
          sequence.profileBundle?.resolverSource === "profiles_package" &&
          sequence.profileBundle?.resolverId === expectedResolverId &&
          sequence.profileBundle?.studioProfileId === expectedStudioProfileId
      ),
    "profiles package adapter stamps profiles_package resolver metadata"
  );
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const economyInput: StoryInput = {
    episode: {
      episode_id: "episode_economy_profile_smoke",
      bible_ref: "economy_demo",
      topic: "Inflation versus wage growth comparison",
      target_duration_sec: 40,
      data_inputs: [{ dataset_id: "economy_comparison" }]
    },
    outline: [
      "Inflation rose faster than wages.",
      "Compare household pressure against income recovery.",
      "Summarize the tradeoffs and next steps."
    ],
    target_beat_count: 4
  };

  const medicalInput: StoryInput = {
    episode: {
      episode_id: "episode_medical_profile_smoke",
      bible_ref: "medical_demo",
      topic: "Clinical treatment timeline and anatomy overview",
      target_duration_sec: 40,
      data_inputs: [{ dataset_id: "medical_outcomes" }]
    },
    outline: [
      "Clinical symptoms improve after treatment.",
      "The treatment pathway shows diagnosis, procedure, and recovery.",
      "Explain the structure of the affected anatomy and summarize care steps."
    ],
    target_beat_count: 4
  };

  const liveProfilesModulePath = path.resolve(__dirname, "../../profiles/src/profileResolver.ts");
  const localSeam = await runScenario("economy_local_seam", economyInput, resolveDeterministicProfileSeam);
  validateLocalSeamScenario(localSeam.props, localSeam.renderLogSummary);

  const economy = await runScenario("economy", economyInput);
  validateEconomyScenario(economy.props, economy.qcReport, economy.renderLogSummary, liveProfilesModulePath);

  const injectedResolver: DeterministicProfileResolver = (input) => {
    const resolved = resolveDeterministicProfileSeam(input);
    return {
      ...resolved,
      profileBundle: {
        ...resolved.profileBundle,
        resolverId: "injected_profile_resolver_smoke_v1",
        resolverSource: "injected",
        studioProfileId: "injected_studio_profile_v1",
        channelProfileId: "injected_channel_profile_v1"
      }
    };
  };
  const injected = await runScenario("economy_injected", economyInput, injectedResolver);
  validateInjectedResolverScenario(injected.props, injected.renderLogSummary);

  const profilesPackageModulePath = path.resolve(__dirname, "./fixtures/profileResolverModule.stub.ts");
  const profilesAdapter = await runScenario("economy_profiles_package", economyInput, undefined, profilesPackageModulePath);
  validateProfilesPackageAdapterScenario(profilesAdapter.props, profilesAdapter.renderLogSummary, profilesPackageModulePath);

  const profilesPackageDefaultFactoryModulePath = path.resolve(__dirname, "./fixtures/profileResolverModule.defaultFactory.stub.ts");
  const profilesDefaultFactory = await runScenario(
    "economy_profiles_package_default_factory",
    economyInput,
    undefined,
    profilesPackageDefaultFactoryModulePath
  );
  validateProfilesPackageAdapterScenario(
    profilesDefaultFactory.props,
    profilesDefaultFactory.renderLogSummary,
    profilesPackageDefaultFactoryModulePath,
    "profiles_package_default_factory_stub_v1",
    "profiles_package_default_factory_studio_v1"
  );

  const medical = await runScenario("medical", medicalInput);
  validateMedicalScenario(medical.props, medical.qcReport, medical.renderLogSummary, liveProfilesModulePath);

  console.log("render:smoke:profiles passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
