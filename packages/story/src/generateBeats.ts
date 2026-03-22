import type { ProfileSelection } from "@ec/profiles";

export type EpisodeInput = {
  episode_id: string;
  bible_ref: string;
  topic: string;
  target_duration_sec: number;
  character_pack_id?: string;
  profiles?: ProfileSelection;
  data_inputs?: EpisodeDataInput[];
};

export type EpisodeDataInputRow = {
  label: string;
  value: number;
  unit?: string;
};

export type EpisodeDataInput = {
  dataset_id: string;
  time_range?: string;
  rows?: EpisodeDataInputRow[];
  unit?: string;
  expected_sum?: number;
  sum_tolerance?: number;
};

export type StoryInput = {
  episode: EpisodeInput;
  outline?: string[];
  paragraphs?: string[];
  target_beat_count?: number;
};

export type BeatReference = {
  datasetId: string;
  refId: string;
  valueRole?: "spoken" | "shown" | "highlighted";
};

export type Beat = {
  id: string;
  type: string;
  intent: string;
  onScreen: string[];
  narration: string;
  emphasis: "low" | "medium" | "high";
  references?: BeatReference[];
};

type SchemaDataRef = {
  dataset_id: string;
  ref_id: string;
  value_role?: "spoken" | "shown" | "highlighted";
};

export type SchemaBeat = {
  beat_id: string;
  kind: string;
  intent: string;
  narration: string;
  on_screen_text: string[];
  data_refs?: SchemaDataRef[];
  tags: string[];
};

export type BeatsDocument = {
  schema_version: "1.0";
  episode: EpisodeInput;
  beats: SchemaBeat[];
};

const KIND_CYCLE = [
  "hook",
  "setup",
  "context",
  "analysis",
  "contrast",
  "evidence",
  "insight",
  "transition",
  "payoff"
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map(normalizeLine)
    .filter((item) => item.length > 0);
}

function collectUnits(input: StoryInput): string[] {
  const units: string[] = [];

  for (const item of input.outline ?? []) {
    const line = normalizeLine(item);
    if (line.length > 0) {
      units.push(line);
    }
  }

  for (const paragraph of input.paragraphs ?? []) {
    const line = normalizeLine(paragraph);
    if (line.length === 0) {
      continue;
    }
    const sentences = splitSentences(line);
    if (sentences.length === 0) {
      units.push(line);
    } else {
      units.push(...sentences);
    }
  }

  if (units.length > 0) {
    return units;
  }

  return [
    "Open with a clear hook and frame the main claim.",
    "Explain why the topic matters right now.",
    "Show one concrete supporting point.",
    "Contrast with an alternative interpretation.",
    "Close with a concise takeaway."
  ];
}

function makeNarration(unit: string, topic: string, index: number, total: number): string {
  if (index === 0) {
    return `Let's begin with ${topic}. ${unit}`;
  }

  if (index === total - 1) {
    return `Final takeaway: ${unit}`;
  }

  const variant = index % 4;
  if (variant === 0) {
    return `Next, ${unit}`;
  }
  if (variant === 1) {
    return `${unit} This sharpens the main point.`;
  }
  if (variant === 2) {
    return `From this angle, ${unit.toLowerCase()}`;
  }
  return `${unit} Keep this detail in view.`;
}

function makeOnScreen(unit: string, index: number): string[] {
  const cleaned = normalizeLine(unit).replace(/[.?!]+$/, "");
  const compact = cleaned.length > 62 ? `${cleaned.slice(0, 59).trim()}...` : cleaned;
  return [compact, `Beat ${index + 1}`];
}

function makeType(index: number, total: number): string {
  if (index === 0) {
    return "hook";
  }
  if (index === total - 1) {
    return "cta";
  }
  return KIND_CYCLE[index % KIND_CYCLE.length];
}

function makeIntent(type: string, unit: string): string {
  if (type === "hook") {
    return "Capture attention and establish context";
  }
  if (type === "cta") {
    return "Summarize and close with a clear next thought";
  }
  const short = unit.length > 72 ? `${unit.slice(0, 69).trim()}...` : unit;
  return `${type} the narrative around: ${short}`;
}

function makeEmphasis(index: number, total: number): "low" | "medium" | "high" {
  if (index === 0 || index === total - 1 || index % 15 === 0) {
    return "high";
  }
  if (index % 5 === 0) {
    return "medium";
  }
  return "low";
}

function makeReferences(input: StoryInput, index: number): BeatReference[] | undefined {
  const source = input.episode.data_inputs?.[0];
  if (!source) {
    return undefined;
  }

  if (index % 4 !== 2) {
    return undefined;
  }

  const refId = `point_${String(index + 1).padStart(3, "0")}`;
  const roles: Array<"spoken" | "shown" | "highlighted"> = ["spoken", "shown", "highlighted"];
  return [
    {
      datasetId: source.dataset_id,
      refId,
      valueRole: roles[index % roles.length]
    }
  ];
}

function resolveTargetBeatCount(input: StoryInput): number {
  const durationBased = Math.round((input.episode.target_duration_sec || 600) / 8);
  const requested = input.target_beat_count ?? durationBased;
  return clamp(requested, 60, 120);
}

export function generateBeats(input: StoryInput): Beat[] {
  const units = collectUnits(input);
  const beatCount = resolveTargetBeatCount(input);
  const beats: Beat[] = [];

  for (let i = 0; i < beatCount; i += 1) {
    const unit = units[i % units.length];
    const type = makeType(i, beatCount);
    beats.push({
      id: `beat_${String(i + 1).padStart(3, "0")}`,
      type,
      intent: makeIntent(type, unit),
      onScreen: makeOnScreen(unit, i),
      narration: makeNarration(unit, input.episode.topic, i, beatCount),
      emphasis: makeEmphasis(i, beatCount),
      references: makeReferences(input, i)
    });
  }

  return beats;
}

export function toBeatsDocument(input: StoryInput, beats: Beat[]): BeatsDocument {
  const schemaBeats: SchemaBeat[] = beats.map((beat) => {
    const dataRefs: SchemaDataRef[] | undefined = beat.references?.map((reference) => ({
      dataset_id: reference.datasetId,
      ref_id: reference.refId,
      value_role: reference.valueRole
    }));

    return {
      beat_id: beat.id,
      kind: beat.type,
      intent: beat.intent,
      narration: beat.narration,
      on_screen_text: beat.onScreen,
      data_refs: dataRefs,
      tags: [`emphasis:${beat.emphasis}`]
    };
  });

  return {
    schema_version: "1.0",
    episode: input.episode,
    beats: schemaBeats
  };
}
