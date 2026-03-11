import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMotionProfile, resolveProfiles } from "@ec/profiles";
import { createValidator } from "@ec/shared";
import { compileShots, toShotsDocument } from "./compileShots";
import { generateBeats, type Beat, type StoryInput } from "./generateBeats";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

const CHART_FAMILY_KINDS = new Set([
  "bar_chart",
  "line_chart",
  "area_chart",
  "pie_or_donut",
  "heatmap",
  "scatter",
  "boxplot",
  "map",
  "table"
]);

function resolvePrimaryChartVisual(shot: ReturnType<typeof compileShots>[number] | undefined) {
  return shot?.visual_objects?.find((object) => object.semantic_role === "primary_explainer") ?? shot?.visual_objects?.[0];
}

function resolveSupportingVisual(shot: ReturnType<typeof compileShots>[number] | undefined) {
  return shot?.visual_objects?.find(
    (object) => object.semantic_role === "supporting_explainer" || object.semantic_role === "accent"
  );
}

function collectMotionPresetRecords(shots: ReturnType<typeof compileShots>) {
  return shots.flatMap((shot) =>
    (shot.visual_objects ?? [])
      .filter(
        (object): object is NonNullable<typeof object> &
          Required<Pick<NonNullable<typeof object>, "motion_preset" | "motion_profile_id">> =>
          typeof object.motion_preset === "string" &&
          object.motion_preset.length > 0 &&
          typeof object.motion_profile_id === "string" &&
          object.motion_profile_id.length > 0
      )
      .map((object) => ({
        shotId: shot.shot_id,
        kind: object.kind,
        motionPreset: object.motion_preset,
        motionProfileId: object.motion_profile_id
      }))
  );
}

function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixtureDir = path.resolve(__dirname, "../fixtures");

  const storyInput = readJson<StoryInput>(path.join(fixtureDir, "demo-outline.json"));
  const beatsForRange = generateBeats(storyInput);
  const shotsForRange = compileShots(beatsForRange);
  const rangeOk = shotsForRange.length >= 25 && shotsForRange.length <= 40;
  console.log(`[${rangeOk ? "PASS" : "FAIL"}] shots range count=${shotsForRange.length}`);
  if (!rangeOk) {
    throw new Error("shots:smoke expected 25..40 shots for demo outline");
  }

  const mergeFixtureBeats = readJson<Beat[]>(path.join(fixtureDir, "shots-beats.json"));
  const mergedShots = compileShots(mergeFixtureBeats, { minShots: 1, maxShots: 40 });
  const mergeOk = mergedShots.length < mergeFixtureBeats.length;
  console.log(`[${mergeOk ? "PASS" : "FAIL"}] merge adjacent beats fixture`);
  if (!mergeOk) {
    throw new Error("shots:smoke expected adjacent-beat merge to reduce shot count");
  }

  const runA = compileShots(beatsForRange);
  const runB = compileShots(beatsForRange);
  const deterministicOk = JSON.stringify(runA) === JSON.stringify(runB);
  console.log(`[${deterministicOk ? "PASS" : "FAIL"}] deterministic output`);
  if (!deterministicOk) {
    throw new Error("shots:smoke output is not deterministic");
  }

  const compactionInput: StoryInput = {
    episode: {
      episode_id: "talk_text_compaction",
      bible_ref: "demo_bible",
      topic: "anime automation",
      target_duration_sec: 40
    },
    paragraphs: [
      "Open with a strong visual hook, then explain why shot-to-shot consistency matters for readable acting and premium insert timing."
    ],
    target_beat_count: 6
  };
  const compactedShots = compileShots(generateBeats(compactionInput), {
    minShots: 2,
    maxShots: 4
  });
  const compactedTalkText = compactedShots[0]?.talk_text ?? "";
  const compactedWordCount = compactedTalkText.split(/\s+/).filter((value) => value.length > 0).length;
  const compactionOk =
    compactedWordCount > 0 &&
    compactedWordCount <= 24 &&
    !/This sharpens the main point/i.test(compactedTalkText) &&
    !/Keep this detail in view/i.test(compactedTalkText);
  console.log(`[${compactionOk ? "PASS" : "FAIL"}] talk text compaction`);
  if (!compactionOk) {
    throw new Error(`shots:smoke talk_text compaction failed: "${compactedTalkText}"`);
  }

  const compactedFirstShot = compactedShots[0];
  const compactedBeatMap = new Map(generateBeats(compactionInput).map((beat) => [beat.id, beat] as const));
  const compactedRawWordCount = (compactedFirstShot?.beat_ids ?? [])
    .flatMap((beatId) => compactedBeatMap.get(beatId)?.narration.split(/\s+/) ?? [])
    .filter((value) => value.length > 0).length;
  const compactedMouthCueCount = compactedFirstShot?.acting.mouth_cues.length ?? 0;
  const actingCompactionOk =
    !!compactedFirstShot &&
    compactedWordCount < compactedRawWordCount &&
    compactedMouthCueCount <= compactedWordCount * 2 + 3 &&
    compactedFirstShot.acting.blink_cues.every((cue) => cue.f >= 0 && cue.f < compactedFirstShot.duration_frames) &&
    compactedFirstShot.acting.gesture_cues.every((cue) => cue.f >= 0 && cue.f < compactedFirstShot.duration_frames) &&
    compactedFirstShot.acting.look_cues.every((cue) => cue.f >= 0 && cue.f < compactedFirstShot.duration_frames) &&
    compactedFirstShot.acting.expression_cues.every((cue) => cue.f >= 0 && cue.f < compactedFirstShot.duration_frames);
  console.log(`[${actingCompactionOk ? "PASS" : "FAIL"}] acting follows compacted talk text`);
  if (!actingCompactionOk) {
    throw new Error("shots:smoke acting cues do not match compacted talk_text");
  }

  const medicalProfileShots = compileShots(generateBeats(compactionInput), {
    minShots: 2,
    maxShots: 4,
    profiles: resolveProfiles({
      channel_profile_id: "medical_channel",
      mascot_profile_id: "med_dog"
    })
  });
  const firstMedicalShot = medicalProfileShots[0];
  const medicalProfileOk =
    !!firstMedicalShot &&
    firstMedicalShot.shot_grammar.camera_size === "cu" &&
    firstMedicalShot.shot_grammar.required_view === "threeQuarter";
  console.log(`[${medicalProfileOk ? "PASS" : "FAIL"}] profile-aware directing defaults`);
  if (!medicalProfileOk) {
    throw new Error("shots:smoke expected medical/med_dog profiles to influence camera size and view");
  }

  const resolvedMedicalProfiles = resolveProfiles({
    channel_profile_id: "medical_channel",
    mascot_profile_id: "med_dog"
  });
  const mascotBundleOk =
    resolvedMedicalProfiles.mascot_morph.snout_length === "medium" &&
    resolvedMedicalProfiles.mascot_acting.pointing_style === "soft_present" &&
    resolvedMedicalProfiles.mascot_brand.finish_style === "soft_clarity";
  console.log(`[${mascotBundleOk ? "PASS" : "FAIL"}] mascot profile bundle resolution`);
  if (!mascotBundleOk) {
    throw new Error("shots:smoke expected resolved mascot bundle layers for med_dog");
  }

  const economyDirectedShots = compileShots(mergeFixtureBeats, {
    minShots: 1,
    maxShots: 40,
    profiles: resolveProfiles({
      channel_profile_id: "economy_channel",
      mascot_profile_id: "eraser_cat"
    })
  });
  const economyDataShot = economyDirectedShots.find((shot) => shot.shot_grammar.insert_need.includes("chart"));
  const economyPrimaryVisual =
    economyDataShot?.visual_objects?.find((object) => object.semantic_role === "primary_explainer") ??
    economyDataShot?.visual_objects?.[0];
  const economyDirectingOk =
    !!economyDataShot &&
    !!economyDataShot.insert_asset &&
    !!economyDataShot.insert_asset.selection &&
    !!economyDataShot.visual_plan &&
    !!economyPrimaryVisual &&
    CHART_FAMILY_KINDS.has(economyPrimaryVisual.kind) &&
    (economyPrimaryVisual.anchors?.some((anchor) => anchor.type === "pointer_anchor") ?? false) &&
    !!economyPrimaryVisual.safe_area &&
    !!economyPrimaryVisual.selection &&
    economyDataShot.visual_plan.selected_primary_kind === economyPrimaryVisual.kind &&
    economyDataShot.visual_plan.insert_need_candidates.includes("chart") &&
    (economyDataShot.shot_grammar.educational_intent === "number_explainer" ||
      economyDataShot.shot_grammar.educational_intent === "trend_emphasis") &&
    economyDataShot.shot_grammar.route_reason === "chart_explainer_dialogue";
  console.log(`[${economyDirectingOk ? "PASS" : "FAIL"}] economy profile insert grammar`);
  if (!economyDirectingOk) {
    throw new Error("shots:smoke expected economy profile to mark chart-driven educational intent");
  }

  const medicalDirectedShots = compileShots(mergeFixtureBeats, {
    minShots: 1,
    maxShots: 40,
    profiles: resolveProfiles({
      channel_profile_id: "medical_channel",
      mascot_profile_id: "med_dog"
    })
  });
  const medicalDataShot = medicalDirectedShots.find((shot) => shot.shot_grammar.insert_need.includes("diagram"));
  const medicalDiagramVisual = medicalDataShot?.visual_objects?.find(
    (object) => object.kind === "anatomy_diagram" || object.kind === "process_flow"
  );
  const medicalDirectingOk =
    !!medicalDataShot &&
    !!medicalDataShot.insert_asset &&
    !!medicalDataShot.insert_asset.selection &&
    !!medicalDataShot.visual_plan &&
    !!medicalDiagramVisual &&
    medicalDataShot.visual_objects?.some((object) => object.source === "planner_v2") &&
    (medicalDiagramVisual.anchors?.some((anchor) => anchor.type === "safe_area_box") ?? false) &&
    !!medicalDiagramVisual.safe_area &&
    medicalDataShot.visual_plan.selected_primary_kind === medicalDiagramVisual.kind &&
    medicalDataShot.shot_grammar.educational_intent === "diagram_explainer" &&
    medicalDataShot.shot_grammar.route_reason === "diagram_explainer_dialogue";
  console.log(`[${medicalDirectingOk ? "PASS" : "FAIL"}] medical profile insert grammar`);
  if (!medicalDirectingOk) {
    throw new Error("shots:smoke expected medical profile to mark diagram-driven educational intent");
  }

  const visualGrammarOk =
    resolvedMedicalProfiles.channel.visual_grammar.preferred_primary_kinds[0] === "anatomy_diagram" &&
    resolveProfiles({
      channel_profile_id: "economy_channel",
      mascot_profile_id: "eraser_cat"
    }).channel.visual_grammar.preferred_primary_kinds.includes("line_chart");
  console.log(`[${visualGrammarOk ? "PASS" : "FAIL"}] channel visual grammar defaults`);
  if (!visualGrammarOk) {
    throw new Error("shots:smoke expected channel visual grammar defaults for economy and medical profiles");
  }

  const selectionProfiles = resolveProfiles({
    channel_profile_id: "economy_channel",
    mascot_profile_id: "eraser_cat"
  });
  const resolverScenarios: Array<{
    label: string;
    beat: Beat;
    expectedKinds: string[];
    expectedShape: string;
    expectedMotionPresets: string[];
    expectedMotionProfileId: string;
  }> = [
    {
      label: "trend",
      beat: {
        id: "resolver_trend",
        type: "analysis",
        intent: "quarterly trend",
        onScreen: ["Quarterly revenue trend"],
        narration: "Revenue rises over time from Q1 to Q4 and the trend keeps climbing.",
        emphasis: "medium",
        references: [
          { datasetId: "revenue_quarterly", refId: "q1", valueRole: "highlighted" },
          { datasetId: "revenue_quarterly", refId: "q2", valueRole: "shown" },
          { datasetId: "revenue_quarterly", refId: "q3", valueRole: "shown" },
          { datasetId: "revenue_quarterly", refId: "q4", valueRole: "highlighted" }
        ]
      },
      expectedKinds: ["area_chart", "line_chart"],
      expectedShape: "time_series",
      expectedMotionPresets: ["trace_reveal"],
      expectedMotionProfileId: "economy_analytic_v1"
    },
    {
      label: "share",
      beat: {
        id: "resolver_share",
        type: "analysis",
        intent: "market share composition",
        onScreen: ["Segment share"],
        narration: "The composition shows how the total share is split across segments.",
        emphasis: "medium",
        references: [
          { datasetId: "market_share_mix", refId: "segment_a", valueRole: "shown" },
          { datasetId: "market_share_mix", refId: "segment_b", valueRole: "shown" },
          { datasetId: "market_share_mix", refId: "segment_c", valueRole: "highlighted" }
        ]
      },
      expectedKinds: ["pie_or_donut"],
      expectedShape: "proportion",
      expectedMotionPresets: ["radial_reveal"],
      expectedMotionProfileId: "economy_analytic_v1"
    },
    {
      label: "region",
      beat: {
        id: "resolver_region",
        type: "analysis",
        intent: "regional demand map",
        onScreen: ["Regional demand"],
        narration: "A region by region market map shows where demand concentrates across countries.",
        emphasis: "medium",
        references: [
          { datasetId: "regional_demand_by_country", refId: "kr", valueRole: "shown" },
          { datasetId: "regional_demand_by_country", refId: "jp", valueRole: "shown" },
          { datasetId: "regional_demand_by_country", refId: "us", valueRole: "highlighted" }
        ]
      },
      expectedKinds: ["map"],
      expectedShape: "geo",
      expectedMotionPresets: ["data_sweep"],
      expectedMotionProfileId: "economy_analytic_v1"
    },
    {
      label: "distribution",
      beat: {
        id: "resolver_distribution",
        type: "analysis",
        intent: "outlier spread",
        onScreen: ["Range and outlier spread"],
        narration: "The distribution highlights the median, quartile spread, and several outlier cases.",
        emphasis: "medium",
        references: [
          { datasetId: "distribution_samples", refId: "p10", valueRole: "shown" },
          { datasetId: "distribution_samples", refId: "p25", valueRole: "shown" },
          { datasetId: "distribution_samples", refId: "p50", valueRole: "highlighted" },
          { datasetId: "distribution_samples", refId: "p75", valueRole: "shown" },
          { datasetId: "distribution_samples", refId: "p90", valueRole: "shown" }
        ]
      },
      expectedKinds: ["boxplot"],
      expectedShape: "distribution",
      expectedMotionPresets: ["data_sweep"],
      expectedMotionProfileId: "economy_analytic_v1"
    }
  ];
  const resolverResults = resolverScenarios.map((scenario) => {
    const shot = compileShots([scenario.beat], {
      minShots: 1,
      maxShots: 1,
      profiles: selectionProfiles
    })[0];
    const chartVisual = resolvePrimaryChartVisual(shot);
    return {
      ...scenario,
      kind: chartVisual?.kind,
      motionPreset: chartVisual?.motion_preset,
      motionProfileId: chartVisual?.motion_profile_id,
      shape: chartVisual?.selection?.data_shape,
      candidateKinds: chartVisual?.selection?.candidate_kinds ?? [],
      selectionReason: chartVisual?.selection?.selection_reason
    };
  });
  const resolverOk = resolverResults.every(
    (result) =>
      !!result.kind &&
      typeof result.motionPreset === "string" &&
      result.motionPreset.length > 0 &&
      result.expectedMotionPresets.includes(result.motionPreset) &&
      result.motionProfileId === result.expectedMotionProfileId &&
      result.expectedKinds.includes(result.kind) &&
      result.shape === result.expectedShape &&
      result.candidateKinds.length > 0 &&
      typeof result.selectionReason === "string" &&
      result.selectionReason.length > 0
  );
  console.log(`[${resolverOk ? "PASS" : "FAIL"}] chart family resolver v1`);
  if (!resolverOk) {
    throw new Error(`shots:smoke resolver mismatch: ${JSON.stringify(resolverResults)}`);
  }

  const supportingResolverScenarios: Array<{
    label: string;
    profiles: ReturnType<typeof resolveProfiles>;
    beat: Beat;
    expectedInsertType: string;
    expectedKinds: string[];
    expectedShape: string;
    expectedMotionPresets: string[];
    expectedMotionProfileId: string;
  }> = [
    {
      label: "economy-timeline-support",
      profiles: selectionProfiles,
      beat: {
        id: "support_timeline",
        type: "analysis",
        intent: "quarterly trend support",
        onScreen: ["Quarterly revenue trend"],
        narration: "Revenue rises over time from Q1 to Q4, so the timeline should show the sequence clearly.",
        emphasis: "medium",
        references: [
          { datasetId: "revenue_quarterly", refId: "q1", valueRole: "shown" },
          { datasetId: "revenue_quarterly", refId: "q2", valueRole: "shown" },
          { datasetId: "revenue_quarterly", refId: "q3", valueRole: "shown" },
          { datasetId: "revenue_quarterly", refId: "q4", valueRole: "highlighted" }
        ]
      },
      expectedInsertType: "chart",
      expectedKinds: ["timeline"],
      expectedShape: "time_series",
      expectedMotionPresets: ["trace_reveal"],
      expectedMotionProfileId: "economy_analytic_v1"
    },
    {
      label: "medical-process-support",
      profiles: resolveProfiles({
        channel_profile_id: "medical_channel",
        mascot_profile_id: "med_dog"
      }),
      beat: {
        id: "support_process",
        type: "analysis",
        intent: "care pathway",
        onScreen: ["Treatment pathway"],
        narration: "First we screen, then we confirm, next we guide treatment, and finally we monitor recovery.",
        emphasis: "medium",
        references: [
          { datasetId: "care_pathway_steps", refId: "step_1", valueRole: "shown" },
          { datasetId: "care_pathway_steps", refId: "step_2", valueRole: "shown" },
          { datasetId: "care_pathway_steps", refId: "step_3", valueRole: "shown" }
        ]
      },
      expectedInsertType: "diagram",
      expectedKinds: ["callout_card", "summary_card", "comparison_board"],
      expectedShape: "process_steps",
      expectedMotionPresets: ["diagram_callout", "comparison_split"],
      expectedMotionProfileId: "medical_guided_v1"
    },
    {
      label: "medical-risk-support",
      profiles: resolveProfiles({
        channel_profile_id: "medical_channel",
        mascot_profile_id: "med_dog"
      }),
      beat: {
        id: "support_risk",
        type: "analysis",
        intent: "warning signs",
        onScreen: ["Warning signs"],
        narration: "Watch for warning signs, risk spikes, and urgent side effect patterns that need caution.",
        emphasis: "high",
        references: [
          { datasetId: "warning_signal_levels", refId: "low", valueRole: "shown" },
          { datasetId: "warning_signal_levels", refId: "high", valueRole: "highlighted" }
        ]
      },
      expectedInsertType: "caution_card",
      expectedKinds: ["risk_meter"],
      expectedShape: "risk_signal",
      expectedMotionPresets: ["risk_sweep"],
      expectedMotionProfileId: "medical_guided_v1"
    }
  ];
  const supportingResolverResults = supportingResolverScenarios.map((scenario) => {
    const shot = compileShots([scenario.beat], {
      minShots: 1,
      maxShots: 1,
      profiles: scenario.profiles
    })[0];
    const supportingVisual = resolveSupportingVisual(shot);
    return {
      label: scenario.label,
      insertType: shot?.insert_asset?.type,
      insertSelectionType: shot?.insert_asset?.selection?.selected_insert_type,
      kind: supportingVisual?.kind,
      motionPreset: supportingVisual?.motion_preset,
      motionProfileId: supportingVisual?.motion_profile_id,
      shape: supportingVisual?.selection?.data_shape,
      candidateKinds: supportingVisual?.selection?.candidate_kinds ?? [],
      selectionReason: supportingVisual?.selection?.selection_reason
    };
  });
  const supportingResolverOk = supportingResolverResults.every(
    (result, index) =>
      !!result.kind &&
      typeof result.motionPreset === "string" &&
      result.motionPreset.length > 0 &&
      result.motionProfileId === supportingResolverScenarios[index].expectedMotionProfileId &&
      !!result.insertType &&
      result.insertType === supportingResolverScenarios[index].expectedInsertType &&
      result.insertSelectionType === result.insertType &&
      supportingResolverScenarios[index].expectedKinds.includes(result.kind) &&
      supportingResolverScenarios[index].expectedMotionPresets.includes(result.motionPreset) &&
      result.shape === supportingResolverScenarios[index].expectedShape &&
      result.candidateKinds.length > 0 &&
      typeof result.selectionReason === "string" &&
      result.selectionReason.length > 0
  );
  console.log(`[${supportingResolverOk ? "PASS" : "FAIL"}] visual object resolver support v1`);
  if (!supportingResolverOk) {
    throw new Error(`shots:smoke support resolver mismatch: ${JSON.stringify(supportingResolverResults)}`);
  }

  const plannerPrimaryScenario = compileShots(
    [
      {
        id: "planner_primary_medical",
        type: "analysis",
        intent: "screening pathway",
        onScreen: ["Screening pathway"],
        narration: "First we screen, then we confirm, and finally we guide treatment through each clinical step.",
        emphasis: "medium",
        references: [
          { datasetId: "screening_pathway_steps", refId: "step_1", valueRole: "shown" },
          { datasetId: "screening_pathway_steps", refId: "step_2", valueRole: "shown" },
          { datasetId: "screening_pathway_steps", refId: "step_3", valueRole: "highlighted" }
        ]
      }
    ],
    {
      minShots: 1,
      maxShots: 1,
      profiles: resolveProfiles({
        channel_profile_id: "medical_channel",
        mascot_profile_id: "med_dog"
      })
    }
  )[0];
  const plannerPrimaryVisual = resolvePrimaryChartVisual(plannerPrimaryScenario);
  const plannerSupportingVisual = resolveSupportingVisual(plannerPrimaryScenario);
  const plannerPairOk =
    !!plannerPrimaryScenario &&
    !!plannerPrimaryScenario.visual_plan &&
    !!plannerPrimaryVisual &&
    !!plannerSupportingVisual &&
    plannerPrimaryVisual.source === "planner_v2" &&
    plannerPrimaryVisual.kind === "process_flow" &&
    plannerPrimaryVisual.motion_preset === "step_stagger" &&
    plannerPrimaryVisual.motion_profile_id === "medical_guided_v1" &&
    typeof plannerPrimaryVisual.motion_preset === "string" &&
    plannerPrimaryVisual.selection?.resolver_id === "visual_object_planner_v2" &&
    plannerSupportingVisual.source === "planner_v2" &&
    plannerSupportingVisual.motion_profile_id === "medical_guided_v1" &&
    typeof plannerSupportingVisual.motion_preset === "string" &&
    plannerPrimaryScenario.insert_asset?.selection?.resolver_id === "visual_object_planner_v2" &&
    plannerPrimaryScenario.visual_plan.selected_intent_family === "diagram_primary" &&
    plannerPrimaryScenario.visual_plan.candidate_intents.length > 0 &&
    plannerPrimaryScenario.visual_plan.selected_primary_kind === "process_flow";
  console.log(`[${plannerPairOk ? "PASS" : "FAIL"}] planner-driven primary/supporting pair`);
  if (!plannerPairOk) {
    throw new Error(
      `shots:smoke planner pair mismatch: ${JSON.stringify({
        primaryKind: plannerPrimaryVisual?.kind,
        primaryMotionPreset: plannerPrimaryVisual?.motion_preset,
        primaryMotionProfileId: plannerPrimaryVisual?.motion_profile_id,
        primarySource: plannerPrimaryVisual?.source,
        primaryResolver: plannerPrimaryVisual?.selection?.resolver_id,
        supportingKind: plannerSupportingVisual?.kind,
        supportingMotionPreset: plannerSupportingVisual?.motion_preset,
        supportingMotionProfileId: plannerSupportingVisual?.motion_profile_id,
        supportingSource: plannerSupportingVisual?.source,
        insertResolver: plannerPrimaryScenario?.insert_asset?.selection?.resolver_id,
        selectedIntentFamily: plannerPrimaryScenario?.visual_plan?.selected_intent_family,
        selectedPrimaryKind: plannerPrimaryScenario?.visual_plan?.selected_primary_kind
      })}`
    );
  }

  const motionBenchmarkCoverageCases = [
    {
      label: "economy",
      records: collectMotionPresetRecords(economyDirectedShots),
      expectedMotionProfileId: "economy_analytic_v1" as const
    },
    {
      label: "medical",
      records: collectMotionPresetRecords(medicalDirectedShots),
      expectedMotionProfileId: "medical_guided_v1" as const
    }
  ];
  const motionBenchmarkCoverageOk = motionBenchmarkCoverageCases.every((scenario) => {
    const benchmarkedPresets = resolveMotionProfile(scenario.expectedMotionProfileId).benchmarked_motion_presets;
    return (
      scenario.records.length > 0 &&
      scenario.records.every(
        (record) =>
          record.motionProfileId === scenario.expectedMotionProfileId &&
          benchmarkedPresets.includes(record.motionPreset)
      )
    );
  });
  console.log(`[${motionBenchmarkCoverageOk ? "PASS" : "FAIL"}] motion preset benchmark coverage`);
  if (!motionBenchmarkCoverageOk) {
    throw new Error(
      `shots:smoke motion benchmark coverage mismatch: ${JSON.stringify(
        motionBenchmarkCoverageCases.map((scenario) => ({
          label: scenario.label,
          expectedMotionProfileId: scenario.expectedMotionProfileId,
          benchmarkedPresets: resolveMotionProfile(scenario.expectedMotionProfileId).benchmarked_motion_presets,
          records: scenario.records
        }))
      )}`
    );
  }

  const validator = createValidator();
  const doc = toShotsDocument(storyInput.episode, shotsForRange);
  const validation = validator.validate("shots.schema.json", doc);
  const schemaOk = validation.ok;
  console.log(`[${schemaOk ? "PASS" : "FAIL"}] shots schema validation`);
  if (!schemaOk) {
    for (const issue of validation.errors) {
      console.log(`  - path=${issue.path} message=${issue.message}`);
    }
    throw new Error("shots:smoke generated document failed schema validation");
  }

  console.log("shots:smoke passed");
}

run();
