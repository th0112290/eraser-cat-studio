type UiBadgeTone = "ok" | "warn" | "bad" | "muted";

export type BenchmarkRefreshAction = {
  label: string;
  command: string;
  hint: string;
  tone: UiBadgeTone;
  badge: string;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function buildHref(pathname: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text.length === 0) {
      continue;
    }
    search.set(key, text);
  }
  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function resolveSinglePackId(packIds: string[] | null | undefined): string | null {
  const resolved = uniqueStrings(packIds ?? []);
  return resolved.length === 1 ? resolved[0] ?? null : null;
}

export function buildBenchmarkRefreshActions(input: {
  staleSourceCount: number;
  agingSourceCount: number;
  packIds?: string[] | null;
}): BenchmarkRefreshAction[] {
  const tone: UiBadgeTone =
    input.staleSourceCount > 0 ? "bad" : input.agingSourceCount > 0 ? "warn" : "muted";
  const resolvedPackIds = uniqueStrings(input.packIds ?? []);
  const primaryPackId = resolvedPackIds[0] ?? "<packId>";
  const economyPackId = resolvedPackIds[0] ?? "<packId>";
  const medicalPackId = resolvedPackIds[1] ?? resolvedPackIds[0] ?? "<packId>";
  return [
    {
      label: "Motion preset benchmark",
      command: "pnpm benchmark:motion-presets",
      hint: "Refreshes motion preset evidence under out/motion_preset_benchmark.json before trusting stale motion guidance.",
      tone,
      badge: "refresh"
    },
    {
      label: "Require-ready motion validation",
      command: "pnpm validate:motion-preset-benchmark -- --require-ready",
      hint: "Verifies age, profile coverage, and failing records before rollout decisions rely on motion benchmark state.",
      tone,
      badge: "validate"
    },
    {
      label: "Motion policy smoke",
      command: "pnpm smoke:motion-policy",
      hint:
        "Runs the shared story/render/video motion policy chain without materializing rollout artifacts. Use this as the fastest operator check before a larger preset or multichannel refresh.",
      tone,
      badge: "smoke"
    },
    {
      label: "Preset rollout refresh",
      command: `pnpm rollout:video-i2v-preset -- --character-pack-id=${primaryPackId}`,
      hint:
        resolvedPackIds.length > 0
          ? `Rebuilds preset benchmark matrix and rollout artifacts for ${primaryPackId} using the pack id inferred from current lineage rows. This wrapper already runs motion benchmark and require-ready validation.`
          : "Rebuilds preset benchmark matrix and rollout artifacts for the current mascot pack when benchmark rows are stale. This wrapper already runs motion benchmark and require-ready validation.",
      tone,
      badge: "rollout"
    },
    {
      label: "Multichannel rollout refresh",
      command: `pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=${economyPackId} --medical-character-pack-id=${medicalPackId}`,
      hint:
        resolvedPackIds.length > 1
          ? `Refreshes cross-channel preset benchmark summary with inferred pack ids ${economyPackId} and ${medicalPackId}. This wrapper already runs motion benchmark and require-ready validation.`
          : resolvedPackIds.length === 1
            ? `Refreshes cross-channel preset benchmark summary with ${economyPackId} in both channel slots. This wrapper already runs motion benchmark and require-ready validation.`
            : "Refreshes cross-channel preset benchmark summary, validation, and rollout artifacts for broader review. Use one shared pack id in both placeholders when both channels should point at the same mascot pack. This wrapper already runs motion benchmark and require-ready validation.",
      tone,
      badge: "multichannel"
    }
  ];
}

export function buildBenchmarkRefreshPlaybooksSection(input: {
  staleSourceCount: number;
  agingSourceCount: number;
  benchmarkRepairHref: string;
  benchmarkRolloutsHref: string;
  actions: BenchmarkRefreshAction[];
}): string {
  const intro =
    input.staleSourceCount > 0
      ? "Artifact roots are stale. Run the matching benchmark refresh command before trusting promotion or rollout decisions."
      : input.agingSourceCount > 0
        ? "Artifact roots are aging. Keep refresh commands adjacent so benchmark drift can be renewed before it becomes stale."
        : "Keep these commands nearby so operators can refresh benchmark evidence without leaving the control plane.";
  const rows = input.actions
    .map(
      (action) =>
        `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(action.label)}</strong></span><span class="mono">${esc(action.command)}</span><span class="muted-text">${esc(action.hint)}</span></div><div class="inline-actions"><span class="badge ${action.tone}">${esc(action.badge)}</span><button type="button" class="secondary" data-copy="${esc(action.command)}">Copy command</button></div></div>`
    )
    .join("");
  return `<section class="card decision-jump-target" id="benchmark-refresh-playbooks"><div class="section-head"><div><h2>Refresh Playbooks</h2><p class="section-intro">${intro}</p></div><div class="inline-actions"><a href="${input.benchmarkRepairHref}">Acceptance</a><a href="${input.benchmarkRolloutsHref}">Rollouts</a></div></div><div class="status-list">${rows}</div></section>`;
}

export function buildRolloutRefreshPlaybooksSection(input: {
  staleSourceCount: number;
  agingSourceCount: number;
  benchmarkRepairHref: string;
  currentRolloutsHref: string;
  packIds?: string[] | null;
}): string {
  return buildBenchmarkRefreshPlaybooksSection({
    staleSourceCount: input.staleSourceCount,
    agingSourceCount: input.agingSourceCount,
    benchmarkRepairHref: input.benchmarkRepairHref,
    benchmarkRolloutsHref: input.currentRolloutsHref,
    actions: buildBenchmarkRefreshActions({
      staleSourceCount: input.staleSourceCount,
      agingSourceCount: input.agingSourceCount,
      packIds: input.packIds
    })
  });
}

export function buildCompactRefreshPlaybookHandoff(input: {
  staleSourceCount: number;
  agingSourceCount: number;
  unknownCount?: number;
  benchmarkRepairHref: string;
  benchmarkRolloutsHref: string;
  packIds?: string[] | null;
}): string {
  const actions = buildBenchmarkRefreshActions({
    staleSourceCount: input.staleSourceCount,
    agingSourceCount: input.agingSourceCount,
    packIds: input.packIds
  });
  const intro =
    input.staleSourceCount > 0
      ? `${input.staleSourceCount} stale artifact rows need refreshed benchmark evidence before promotion or route acceptance stays trustworthy.`
      : input.agingSourceCount > 0
        ? `${input.agingSourceCount} aging artifact rows should be refreshed soon if review signals still disagree.`
        : (input.unknownCount ?? 0) > 0
          ? `${input.unknownCount} artifact rows are missing parseable timestamps. Keep refresh playbooks adjacent until provenance is re-materialized.`
          : "Refresh playbooks stay attached here so operators can renew evidence without leaving the current explorer.";
  const rows = actions
    .map(
      (action) =>
        `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(action.label)}</strong></span><span class="mono">${esc(action.command)}</span><span class="muted-text">${esc(action.hint)}</span></div><div class="inline-actions"><span class="badge ${action.tone}">${esc(action.badge)}</span><button type="button" class="secondary" data-copy="${esc(action.command)}">Copy command</button></div></div>`
    )
    .join("");
  return `<div class="ops-review-note ops-review-jump-target"><strong>Refresh handoff</strong><span class="muted-text">${esc(intro)}</span><div class="quick-links"><a href="#benchmark-refresh-playbooks">Open playbooks</a><a href="${input.benchmarkRepairHref}">Acceptance</a><a href="${input.benchmarkRolloutsHref}">Rollouts</a></div><details class="ops-review-drawer" id="benchmark-refresh-playbooks"><summary>Open refresh playbooks</summary><div class="ops-review-drawer-body"><div class="status-list">${rows}</div></div></details></div>`;
}

export function buildRigRepairHandoffLinks(input: {
  currentHref: string;
  characterPackId?: string | null;
  fixturePath?: string | null;
  repairable?: boolean | null;
  recreateRecommended?: boolean | null;
}): string {
  const characterPackId = str(input.characterPackId);
  const fixturePath = str(input.fixturePath);
  const actions: string[] = [];
  if (characterPackId) {
    const charactersHref = buildHref("/ui/characters", {
      characterPackId,
      returnTo: input.currentHref,
      currentObject: `pack:${characterPackId}`,
      focus: "pack-review-current"
    });
    const generatorFocus = input.recreateRecommended === true && input.repairable !== true ? "recreate-pack" : "cg-manual-overrides";
    const generatorLabel = generatorFocus === "recreate-pack" ? "Generator Recreate" : "Generator Repair";
    const generatorHref = buildHref("/ui/character-generator", {
      characterPackId,
      packId: characterPackId,
      currentObject: `pack:${characterPackId}`,
      returnTo: input.currentHref,
      focus: generatorFocus
    });
    actions.push(`<a href="${charactersHref}">Characters</a>`);
    actions.push(`<a href="${generatorHref}">${generatorLabel}</a>`);
  }
  if (fixturePath) {
    actions.push(`<button type="button" class="secondary" data-copy="${esc(fixturePath)}">Copy fixture</button>`);
  }
  return actions.join("");
}
