export type SourceMetadata = {
  sourceId: string;
  title?: string;
  url?: string;
};

export type FactInput = {
  text: string;
  source?: SourceMetadata;
};

export type OutlineSectionName = "Hook" | "Development" | "Payoff";

export type OutlinePoint = {
  id: string;
  text: string;
  sources: SourceMetadata[];
};

export type OutlineSection = {
  name: OutlineSectionName;
  points: OutlinePoint[];
};

export type ScriptOutline = {
  topic: string;
  targetMinutes: 10;
  sections: OutlineSection[];
  sources: SourceMetadata[];
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTopic(topic: string): string {
  const cleaned = normalizeText(topic);
  return cleaned.length > 0 ? cleaned : "Untitled Topic";
}

function normalizeFacts(facts: FactInput[]): FactInput[] {
  const normalized: FactInput[] = [];

  for (const fact of facts) {
    const text = normalizeText(fact.text);
    if (!text) {
      continue;
    }

    const source: SourceMetadata | undefined = fact.source?.sourceId
      ? {
          sourceId: normalizeText(fact.source.sourceId),
          title: fact.source.title ? normalizeText(fact.source.title) : undefined,
          url: fact.source.url ? normalizeText(fact.source.url) : undefined
        }
      : undefined;

    normalized.push({ text, source });
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      text: "Define the baseline clearly before making claims.",
      source: {
        sourceId: "fallback-01",
        title: "Internal baseline note"
      }
    },
    {
      text: "Compare at least two concrete alternatives.",
      source: {
        sourceId: "fallback-02",
        title: "Internal comparison note"
      }
    }
  ];
}

function collectSources(facts: FactInput[]): SourceMetadata[] {
  const seen = new Set<string>();
  const out: SourceMetadata[] = [];

  for (const fact of facts) {
    if (!fact.source || !fact.source.sourceId) {
      continue;
    }
    if (seen.has(fact.source.sourceId)) {
      continue;
    }
    seen.add(fact.source.sourceId);
    out.push(fact.source);
  }

  return out;
}

export function applyTemplate(topic: string, facts: FactInput[]): ScriptOutline {
  const safeTopic = normalizeTopic(topic);
  const safeFacts = normalizeFacts(facts);
  const sources = collectSources(safeFacts);

  const hook: OutlinePoint[] = [
    {
      id: "hook_001",
      text: `Why does ${safeTopic} matter now, and what changes if we get it wrong?`,
      sources: []
    },
    {
      id: "hook_002",
      text: `In ten minutes, we will move from confusion to a practical decision framework for ${safeTopic}.`,
      sources: []
    }
  ];

  const development: OutlinePoint[] = safeFacts.map((fact, index) => ({
    id: `dev_${String(index + 1).padStart(3, "0")}`,
    text: fact.text,
    sources: fact.source ? [fact.source] : []
  }));

  const payoff: OutlinePoint[] = [
    {
      id: "payoff_001",
      text: `Synthesize the strongest evidence into one clear position on ${safeTopic}.`,
      sources
    },
    {
      id: "payoff_002",
      text: "Close with one next action the audience can execute today.",
      sources: []
    }
  ];

  return {
    topic: safeTopic,
    targetMinutes: 10,
    sections: [
      { name: "Hook", points: hook },
      { name: "Development", points: development },
      { name: "Payoff", points: payoff }
    ],
    sources
  };
}
