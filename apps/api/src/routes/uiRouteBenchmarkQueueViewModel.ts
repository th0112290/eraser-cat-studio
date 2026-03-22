export function buildBenchmarkQueueViewModel(input: any) {
  const {
    decisionState,
    currentBenchmarksHref,
    benchmarkRepairHref,
    benchmarkRouteHref,
    benchmarkLineageHref,
    collectBenchmarkViewerData,
    collectRepairAcceptanceRows,
    collectDatasetLineageRows,
    uniqueStrings,
    summarizeCounts,
    normalizeRolloutStatus,
    describeArtifactFreshness,
    buildDecisionAnchorId,
    compact,
    fmtDate,
    buildRigRepairHandoffLinks,
    esc,
    uiHref,
    summarizeValues,
    rolloutStatusLabel,
    decisionToken,
    decisionTokenSet,
    decisionSetHas
  } = input;

  const benchmarkFocusValue = decisionToken(decisionState.focus);
  const benchmarkSelectedTokens = decisionTokenSet(decisionState.selected);
  const benchmarkPinnedTokens = decisionTokenSet(decisionState.pinned);
  const withBenchmarkSelection = (...values: Array<string | null | undefined>): string[] =>
    uniqueStrings([
      ...decisionState.selected,
      ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    ]);
  const isBenchmarkFocused = (...values: Array<string | null | undefined>): boolean =>
    decisionSetHas(benchmarkSelectedTokens, ...values) ||
    decisionSetHas(benchmarkPinnedTokens, ...values) ||
    values.some((value) => benchmarkFocusValue === decisionToken(value));

  const { sources, backendScenarios, regressions } = collectBenchmarkViewerData();
  const benchmarkRigRows = collectRepairAcceptanceRows();
  const benchmarkLineageRows = collectDatasetLineageRows();
  const benchmarkPackIds = uniqueStrings(benchmarkLineageRows.flatMap((row: any) => row.packIds));
  const rigAttentionRows = benchmarkRigRows.filter(
    (row: any) => row.rig.rigBlocked || row.rig.reviewOnly || row.rig.lowAnchorConfidence || row.rig.recreateRecommended
  );
  const backendReady = backendScenarios.filter((row: any) => normalizeRolloutStatus(row.status) === "ready").length;
  const regressionBlocked = regressions.filter((row: any) => normalizeRolloutStatus(row.status) === "blocked").length;
  const regressionWarn = regressions.filter((row: any) => normalizeRolloutStatus(row.status) === "warn").length;
  const mismatchTotal = regressions.reduce((sum: number, row: any) => sum + row.mismatchCount, 0);
  const rigBlockedCount = benchmarkRigRows.filter((row: any) => row.rig.rigBlocked).length;
  const reviewOnlyCount = benchmarkRigRows.filter((row: any) => row.rig.reviewOnly).length;
  const lowAnchorCount = benchmarkRigRows.filter((row: any) => row.rig.lowAnchorConfidence).length;
  const repairableCount = benchmarkRigRows.filter((row: any) => row.rig.repairable === true).length;
  const recreateCount = benchmarkRigRows.filter((row: any) => row.rig.recreateRecommended).length;
  const rigSpeciesSummary = summarizeCounts(rigAttentionRows.map((row: any) => row.rig.speciesId), 2);
  const rigViewSummary = summarizeCounts(rigAttentionRows.map((row: any) => row.rig.selectedView), 2);
  const availableSources = sources.filter((source: any) => source.exists).length;
  const benchmarkCompareLinks =
    backendScenarios.reduce((sum: number, row: any) => sum + row.candidateCompareItems.length, 0) +
    regressions.reduce((sum: number, row: any) => sum + row.candidateCompareItems.length, 0);
  const sourceFreshness = sources.map((source: any) => ({ source, freshness: describeArtifactFreshness(source.latestGeneratedAt) }));
  const staleSourceCount = sourceFreshness.filter((entry: any) => entry.source.exists && entry.freshness.isStale).length;
  const agingSourceCount = sourceFreshness.filter((entry: any) => entry.source.exists && entry.freshness.isAging).length;

  const sourceRows = sourceFreshness
    .map(({ source, freshness }: any) => {
      const tone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
      const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} artifacts` : "empty";
      const meta = compact([
        source.exists ? "scan ok" : "root missing",
        source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no benchmark artifacts",
        source.exists ? freshness.detail : ""
      ]);
      return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span>${source.exists ? `<span class="badge ${freshness.tone}">${esc(freshness.label)}</span>` : ""}${freshness.isStale || freshness.isAging ? `<a class="secondary" href="#benchmark-refresh-playbooks">Refresh playbooks</a>` : ""}${freshness.isStale ? `<a class="secondary" href="${benchmarkRepairHref}">Open repair queue</a>` : ""}<button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
    })
    .join("");

  const backendRows = backendScenarios
    .map((row: any) => {
      const rowId = buildDecisionAnchorId("benchmark-backend", compact([row.backend, row.renderer, row.benchmarkKind], "-") || row.artifactRelativePath);
      const detailHref = uiHref("/ui/rollouts/detail", {
        preserveDecision: decisionState,
        params: {
          path: row.detailArtifactPath,
          returnTo: currentBenchmarksHref,
          focus: row.backend,
          selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
        },
        hash: "rollout-evidence"
      });
      const smokeHref = row.smokeArtifactPath
        ? uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: row.smokeArtifactPath,
              returnTo: currentBenchmarksHref,
              focus: row.backend,
              selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
            },
            hash: "rollout-evidence"
          })
        : "";
      const planHref = row.planArtifactPath
        ? uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: row.planArtifactPath,
              returnTo: currentBenchmarksHref,
              focus: row.backend,
              selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
            },
            hash: "rollout-evidence"
          })
        : "";
      const candidateLinks = row.candidateCompareItems
        .map((item: any) => `<a href="${uiHref("/ui/benchmarks/candidates", {
          preserveDecision: decisionState,
          params: {
            path: item.path,
            returnTo: currentBenchmarksHref,
            focus: "selected",
            selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind),
            compare: withBenchmarkSelection(item.label, row.backend)
          },
          hash: "candidate-compare-shell"
        })}">${esc(item.label)}</a>`)
        .join("");
      const repairHandoffLinks = buildRigRepairHandoffLinks({
        currentHref: currentBenchmarksHref,
        characterPackId: row.characterPackId,
        fixturePath: row.fixturePath,
        repairable: row.repairable,
        recreateRecommended: row.recreateRecommended
      });
      return `<tr id="${rowId}" class="decision-focus-row${isBenchmarkFocused(row.backend, row.renderer, row.benchmarkKind, row.artifactRelativePath) ? " is-focused" : ""}">
        <td><div class="table-note"><strong>${esc(row.backend)}</strong><span class="muted-text">${esc(`${row.benchmarkKind} / ${row.renderer}`)}</span><span class="muted-text">${esc(compact([row.speciesId ? `species ${row.speciesId}` : null, row.selectedView ? `view ${row.selectedView}` : null, row.repairable === true ? "repairable" : row.recreateRecommended ? "recreate_required" : null]) || "-")}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Decision Detail</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${planHref ? `<a href="${planHref}">Plan</a>` : ""}${repairHandoffLinks}${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.detailArtifactPath)}">Copy path</button></div></div></td>
        <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
        <td>${esc(row.latencyMs)}</td>
        <td>${esc(row.acceptanceRate)}</td>
        <td>${esc(row.failureRate)}</td>
        <td><div class="table-note"><strong>${esc(row.notes)}</strong><span class="muted-text">${esc(row.rigReasonFamilies.length > 0 ? `families ${summarizeValues(row.rigReasonFamilies, 3)}` : "-")}</span><span class="muted-text">${esc(row.repairLineageSummary.length > 0 ? `lineage ${summarizeValues(row.repairLineageSummary, 2)}` : row.directiveFamilySummary.length > 0 ? `directives ${summarizeValues(row.directiveFamilySummary, 2)}` : "-")}</span></div></td>
        <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
      </tr>`;
    })
    .join("");

  const regressionRows = regressions
    .map((row: any) => {
      const rowId = buildDecisionAnchorId("benchmark-regression", compact([row.episodeId, row.benchmarkName], "-") || row.artifactRelativePath);
      const detailHref = uiHref("/ui/rollouts/detail", {
        preserveDecision: decisionState,
        params: {
          path: row.artifactPath,
          returnTo: currentBenchmarksHref,
          focus: row.episodeId,
          selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
        },
        hash: "rollout-evidence"
      });
      const smokeHref = row.smokeArtifactPath
        ? uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: row.smokeArtifactPath,
              returnTo: currentBenchmarksHref,
              focus: row.episodeId,
              selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
            },
            hash: "rollout-evidence"
          })
        : "";
      const renderModeHref = row.renderModeArtifactPath
        ? uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: row.renderModeArtifactPath,
              returnTo: currentBenchmarksHref,
              focus: row.episodeId,
              selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
            },
            hash: "rollout-evidence"
          })
        : "";
      const rowRepairHref = uiHref("/ui/benchmarks/repair-acceptance", {
        preserveDecision: decisionState,
        params: {
          q: row.episodeId,
          source: row.sourcePath,
          returnTo: currentBenchmarksHref,
          focus: row.episodeId,
          selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
        },
        hash: "repair-acceptance-table"
      });
      const rowRouteHref = uiHref("/ui/benchmarks/route-reasons", {
        preserveDecision: decisionState,
        params: {
          q: row.episodeId,
          source: row.sourcePath,
          returnTo: currentBenchmarksHref,
          focus: row.episodeId,
          selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
        },
        hash: "route-reason-table"
      });
      const rowLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
        preserveDecision: decisionState,
        params: {
          episodeId: row.episodeId,
          source: row.sourcePath,
          returnTo: currentBenchmarksHref,
          focus: row.episodeId,
          selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
        },
        hash: "dataset-lineage-table"
      });
      const candidateLinks = row.candidateCompareItems
        .map((item: any) => `<a href="${uiHref("/ui/benchmarks/candidates", {
          preserveDecision: decisionState,
          params: {
            path: item.path,
            returnTo: currentBenchmarksHref,
            focus: "selected",
            selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath),
            compare: withBenchmarkSelection(item.label, row.episodeId)
          },
          hash: "candidate-compare-shell"
        })}">${esc(item.label)}</a>`)
        .join("");
      return `<tr id="${rowId}" class="decision-focus-row${isBenchmarkFocused(row.episodeId, row.benchmarkName, row.bundlePath, row.artifactRelativePath) ? " is-focused" : ""}">
        <td><div class="table-note"><strong>${esc(row.benchmarkName)}</strong><span class="muted-text">${esc(row.bundlePath)}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Decision Detail</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${renderModeHref ? `<a href="${renderModeHref}">Render Modes</a>` : ""}<a href="${rowRepairHref}">Repair</a><a href="${rowRouteHref}">route_reason</a><a href="${rowLineageHref}">Lineage</a>${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.artifactPath)}">Copy path</button></div></div></td>
        <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
        <td>${esc(`${row.warningCount} warn / ${row.errorCount} err`)}</td>
        <td>${esc(row.profileSummary)}</td>
        <td>${esc(row.renderModeSummary)}</td>
        <td>${esc(row.issueSummary)}</td>
        <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
      </tr>`;
    })
    .join("");

  return {
    sources,
    backendScenarios,
    regressions,
    benchmarkPackIds,
    backendReady,
    regressionBlocked,
    regressionWarn,
    mismatchTotal,
    rigBlockedCount,
    reviewOnlyCount,
    lowAnchorCount,
    repairableCount,
    recreateCount,
    rigSpeciesSummary,
    rigViewSummary,
    availableSources,
    benchmarkCompareLinks,
    staleSourceCount,
    agingSourceCount,
    sourceRows,
    backendRows,
    regressionRows
  };
}
