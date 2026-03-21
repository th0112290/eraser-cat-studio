// @ts-nocheck

export function buildBenchmarkQueueSurface(input: any) {
  const {
    decisionState,
    benchmarkTone,
    benchmarkStatusLabel,
    benchmarkReturnHref,
    benchmarkReturnLabel,
    benchmarkRolloutsHref,
    benchmarkRepairHref,
    benchmarkRouteHref,
    benchmarkLineageHref,
    currentBenchmarksHref,
    benchmarkSummaryCards,
    benchmarkFocusValue,
    sources,
    availableSources,
    backendReady,
    regressions,
    regressionBlocked,
    regressionWarn,
    benchmarkCompareLinks,
    mismatchTotal,
    rigBlockedCount,
    reviewOnlyCount,
    lowAnchorCount,
    sourceRows,
    backendRows,
    regressionRows,
    benchmarkRefreshSection,
    flashHtmlContent,
    fmtDate,
    rolloutStatusLabel,
    renderDecisionJumpBanner,
    renderObjectHero,
    renderDecisionPrioritySection,
    renderRecoveryRailSection,
    renderArtifactEvidenceSection,
    renderDecisionJumpScript,
    humanizeOpsLabel,
    summarizeValues,
    decisionToken
  } = input;

  const benchmarkBlockers = [];
  if (regressionBlocked > 0) {
    benchmarkBlockers.push({
      title: "Regression blockers in queue",
      detail: `${regressionBlocked} regression objects are blocked or failed. Clear those before treating backend-ready rows as promotable evidence.`,
      tone: "bad",
      badge: "blocked"
    });
  }
  if (availableSources < sources.length) {
    benchmarkBlockers.push({
      title: "Artifact roots missing",
      detail: `${sources.length - availableSources} configured roots are missing, so queue coverage is incomplete for this review object.`,
      tone: "warn",
      badge: "sources"
    });
  }
  if (rigBlockedCount > 0) {
    benchmarkBlockers.push({
      title: "Rig-blocked winners in queue",
      detail: `${rigBlockedCount} benchmark shots currently point at selected candidates with fail-level rig signals. Keep those in compare-before-promote review.`,
      tone: "bad",
      badge: "rig"
    });
  }

  const benchmarkPrimaryActions = [
    {
      title: "Start with blocked regression rows",
      detail: regressionBlocked > 0 ? `${regressionBlocked} blocked rows should be cleared before backend-ready scenarios are treated as promotion candidates.` : "Regression blockers are clear. Use the queue to confirm compare-before-promote readiness.",
      tone: benchmarkTone,
      badge: regressionBlocked > 0 ? "recover" : "ready",
      html: `<a href="#benchmark-regressions">Regression Queue</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`
    }
  ];
  const benchmarkSecondaryActions = [
    {
      title: "Compare before promote",
      detail: benchmarkCompareLinks > 0 ? `${benchmarkCompareLinks} candidate compare links are attached to the queue. Stay in those review objects before dropping to raw evidence.` : "Candidate compare artifacts are sparse in this queue, so rely on rollout detail, smoke, and route explorers instead.",
      tone: benchmarkCompareLinks > 0 ? "warn" : "muted",
      badge: "compare",
      html: `<a href="${benchmarkRepairHref}">Acceptance Explorer</a><a href="${benchmarkRouteHref}">Route Explorer</a>`
    }
  ];
  const benchmarkRecoveryActions = [
    {
      title: "Recovery path",
      detail: "Acceptance, route reason, and lineage explorers stay adjacent so blocked bundles recover without forcing the operator into raw JSON.",
      tone: benchmarkTone,
      badge: "recover",
      html: `<a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkLineageHref}">Lineage</a>`
    }
  ];
  const benchmarkLinkedObjects = [
    { title: "Rollout queue", detail: "Benchmark review hands off to rollout review once a candidate is promotion-ready.", tone: "muted", html: `<a href="${benchmarkRolloutsHref}">Open Rollouts</a>` },
    { title: "Artifact sources", detail: `${availableSources}/${sources.length} roots are readable for this queue object.`, tone: availableSources === sources.length ? "ok" : "warn", badge: "sources", html: `<a href="#benchmark-sources">Artifact Sources</a>` }
  ];
  const benchmarkDecisionRail = [
    {
      title: regressionBlocked > 0 ? "Recover blocked regressions" : "Benchmark queue gate",
      detail: regressionBlocked > 0 ? "Blocked regressions stay ahead of backend browsing. Recover those rows before treating the queue as promotable." : "If the regression queue is clean, use backend and compare objects to confirm promotable benchmark outputs.",
      tone: benchmarkTone,
      badge: regressionBlocked > 0 ? "recover" : "gate",
      html: `<a href="#benchmark-regressions">Regression Queue</a><a href="#benchmark-backends">Backend Objects</a>`
    },
    {
      title: "Compare before promote",
      detail: benchmarkCompareLinks > 0 ? `${benchmarkCompareLinks} compare links remain available from the queue. Use them before opening deeper artifact evidence.` : "Stay in rollout detail, smoke, and route explorers when compare artifacts are missing.",
      tone: benchmarkCompareLinks > 0 ? "warn" : "muted",
      badge: "compare",
      html: `<a href="${benchmarkRolloutsHref}">Rollouts</a><a href="${benchmarkRouteHref}">Route Explorer</a>`
    },
    {
      title: "Rollback anchor",
      detail: backendReady > 0 ? `${backendReady} backend scenarios are currently usable as the cleanest queue-side benchmark anchor.` : "No backend-ready scenario is available yet, so regression recovery remains the current anchor.",
      tone: backendReady > 0 ? "ok" : "warn",
      badge: "rollback",
      html: `<a href="${benchmarkRepairHref}">Acceptance Explorer</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`
    }
  ];
  const benchmarkSnapshotFacts = [
    { label: "Failure Reason", value: regressionBlocked > 0 ? `${regressionBlocked} blocked regression rows` : regressionWarn > 0 ? `${regressionWarn} warning regression rows` : "none", hint: "top benchmark blocker" },
    { label: "Last Known Good", value: backendReady > 0 ? `${backendReady} ready backend scenarios` : "no ready backend scenario", hint: "queue-side clean anchor" },
    { label: "Fallback Applied", value: mismatchTotal > 0 ? `${mismatchTotal} render drift mismatches` : "no render drift", hint: "current compare baggage" },
    { label: "Retry Path", value: regressionBlocked > 0 ? "repair explorer -> rollout detail -> candidate compare" : "benchmark queue -> rollout detail", hint: benchmarkStatusLabel },
    { label: "Alternate Path", value: "repair / route / lineage explorers", hint: "adjacent review surfaces" },
    { label: "Rollback Point", value: backendReady > 0 ? "ready backend scenarios" : "regression recovery queue", hint: "benchmark queue rollback anchor" }
  ];
  const benchmarkEvidenceFacts = [
    { label: "Sources", value: `${availableSources}/${sources.length}`, hint: "configured artifact roots available" },
    { label: "Backend Objects", value: String(backendReady >= 0 ? input.backendScenarios.length : 0), hint: "artifact-backed backend scenarios" },
    { label: "Regression Objects", value: String(regressions.length), hint: `${regressionBlocked} blocked / ${regressionWarn} warn` },
    { label: "Compare Links", value: String(benchmarkCompareLinks), hint: "candidate compare surfaces attached to queue" },
    { label: "Rig Flags", value: `${rigBlockedCount} blocked / ${reviewOnlyCount} review_only / ${lowAnchorCount} low anchor`, hint: "selected-candidate rig summary across benchmark shots" }
  ];
  const benchmarkJumpFacts = [
    ...(decisionState.focus ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or section focus" }] : []),
    ...(decisionState.selected.length > 0 ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in queue state` }] : []),
    ...(decisionState.compare.length > 0 ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to benchmark review" }] : []),
    ...(decisionState.pinned.length > 0 ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }] : []),
    ...(decisionState.view ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }] : [])
  ];
  const benchmarkJumpBanner = renderDecisionJumpBanner({
    title: "Deep-link handoff",
    intro: "Selection, compare context, and return path stay visible so the benchmark queue reads as the next decision surface instead of a detached artifact list.",
    facts: benchmarkJumpFacts,
    linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="${benchmarkRolloutsHref}">Rollouts</a><a href="${currentBenchmarksHref}">Refresh handoff</a>`,
    tone: benchmarkTone
  });
  const benchmarkEvidenceDrawerBody = `<div class="decision-copy">This queue is an artifact-backed benchmark review object. Use decision detail, smoke, render modes, and compare surfaces before raw artifact payloads.</div><div class="status-list">${sourceRows || '<div class="notice">No benchmark artifact sources configured.</div>'}</div><details class="decision-drawer"><summary>Open benchmark evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Benchmark queue -> regression queue -> rollout detail -> candidate compare -> raw artifact payloads. Raw evidence should be the fallback, not the default queue workflow.</div><div class="quick-links"><a href="${benchmarkRolloutsHref}">Rollouts</a><a href="/ui/artifacts">Artifacts</a></div></div></details>`;

  return `${input.decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
    eyebrow: "Benchmark Review",
    title: "Benchmarks",
    subtitle: "Treat benchmarks as artifact-backed review objects: blocked regressions, compare-before-promote context, and rollback anchors stay above source rows and raw evidence.",
    statusLabel: benchmarkStatusLabel,
    statusTone: benchmarkTone,
    flash: `${flashHtmlContent}${benchmarkJumpBanner}`,
    quickLinksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="${benchmarkRolloutsHref}">Open Rollouts</a><a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkRouteHref}">Route Explorer</a><a href="${benchmarkLineageHref}">Lineage</a>`,
    summaryCards: benchmarkSummaryCards,
    metaItems: [
      { label: "Artifact Sources", value: `${availableSources}/${sources.length}`, hint: "configured roots available" },
      { label: "Ready Backends", value: String(backendReady), hint: "usable backend scenarios" },
      { label: "Regression Blocked", value: String(regressionBlocked), hint: "blocked or failed regression objects" },
      { label: "Rollout Handoff", value: benchmarkCompareLinks > 0 ? "candidate compare ready" : "detail-first review", hint: "queue-side handoff to rollout objects" }
    ],
    blockers: benchmarkBlockers,
    primaryActions: benchmarkPrimaryActions,
    secondaryActions: benchmarkSecondaryActions,
    recoveryActions: benchmarkRecoveryActions,
    recentActivity: regressions.slice(0, 4).map((row: any) => ({
      title: row.benchmarkName,
      detail: `${rolloutStatusLabel(row.status)} | ${row.issueSummary} | ${fmtDate(row.generatedAt)}`,
      tone: row.tone,
      badge: row.episodeId
    })),
    linkedObjects: benchmarkLinkedObjects
  })}${renderDecisionPrioritySection({
    sectionId: "benchmark-decision-rail",
    title: "Decision Rail",
    intro: "Blocked regressions, compare-before-promote rules, and rollback anchors stay above queue scanning.",
    linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="#benchmark-backends">Backend Objects</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`,
    railTitle: "Benchmark actions",
    railIntro: "Recover blocked rows first, compare before promote, then use the cleanest ready scenario as the queue-side rollback anchor.",
    railCards: benchmarkDecisionRail,
    railEmpty: "No benchmark actions are available.",
    railTone: benchmarkTone,
    snapshotIntro: "Failure reason, last-known-good queue anchor, retry path, and rollback point stay above queue tables.",
    snapshotFacts: benchmarkSnapshotFacts,
    snapshotEmpty: "No benchmark recovery snapshot is available.",
    snapshotTone: benchmarkTone
  })}${renderRecoveryRailSection({
    sectionId: "benchmark-recovery-rail",
    title: "Recovery / Linked Objects",
    intro: "Recovery explorers and linked queues stay visible before table-heavy evidence.",
    linksHtml: `<a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkRouteHref}">Route Explorer</a><a href="${benchmarkLineageHref}">Lineage</a>`,
    recoveryTitle: "Recovery rail",
    recoveryIntro: "Keep acceptance, route, and lineage explorers adjacent to the queue so review stays at the decision layer.",
    recoveryCards: benchmarkRecoveryActions,
    recoveryEmpty: "No benchmark recovery rail is available.",
    recoveryTone: benchmarkTone,
    linkedTitle: "Linked object rail",
    linkedIntro: "Rollout queue and artifact sources remain attached to the benchmark queue object.",
    linkedCards: benchmarkLinkedObjects,
    linkedEmpty: "No linked benchmark objects are available.",
    linkedTone: "muted"
  })}${benchmarkRefreshSection}${renderArtifactEvidenceSection({
    sectionId: "benchmark-evidence",
    title: "Artifact Evidence Drawer",
    intro: "Artifact sources and raw evidence stay available, but the queue remains the primary review surface.",
    linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="/ui/artifacts">Artifacts</a>`,
    summaryTitle: "Benchmark evidence summary",
    summaryIntro: "Source availability, queue counts, and compare links stay above source rows.",
    summaryFacts: benchmarkEvidenceFacts,
    summaryEmpty: "No benchmark evidence summary is available.",
    summaryTone: benchmarkTone,
    drawerTitle: "Benchmark evidence drawer",
    drawerIntro: "Open source roots and evidence order only after the queue still looks inconclusive.",
    drawerSummary: "Open benchmark evidence order and raw-evidence policy",
    drawerBodyHtml: benchmarkEvidenceDrawerBody,
    drawerTone: "muted",
    drawerOpen: ["evidence", "artifact", "raw"].includes(benchmarkFocusValue) || decisionToken(decisionState.view) === "evidence"
  })}<section class="card decision-jump-target" id="benchmark-backends"><div class="section-head"><div><h2>Backend Review Objects</h2><p class="section-intro">Use backend artifacts as the primary compare-before-promote surface.</p></div><input type="search" data-table-filter="benchmark-backend-table" aria-label="Filter backend benchmark objects" placeholder="Search backend, renderer, detail path..."/></div><div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>Scenario / Next Action</th><th>Status</th><th>Latency</th><th>Acceptance</th><th>Failure</th><th>Notes</th><th>Source</th></tr></thead><tbody>${backendRows || '<tr><td colspan="7"><div class="notice">No backend benchmark scenarios were found.</div></td></tr>'}</tbody></table></div></section><section class="card decision-jump-target" id="benchmark-regressions"><div class="section-head"><div><h2>Regression Review Queue</h2><p class="section-intro">Blocked and warning regression objects stay explicit so recovery starts here.</p></div><input type="search" data-table-filter="benchmark-regression-table" aria-label="Filter benchmark regression objects" placeholder="Search bundle, episode, issue, render drift..."/></div><div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>Regression Object / Next Action</th><th>Status</th><th>Warnings / Errors</th><th>Profiles</th><th>Render Path</th><th>Issue Summary</th><th>Source</th></tr></thead><tbody>${regressionRows || '<tr><td colspan="7"><div class="notice">No regression artifacts were found.</div></td></tr>'}</tbody></table></div></section><section class="card decision-jump-target" id="benchmark-sources"><div class="section-head"><div><h2>Artifact Sources</h2><p class="section-intro">Source roots remain available as supporting evidence, but they no longer lead the page narrative.</p></div></div><div class="status-list">${sourceRows || '<div class="notice">No benchmark artifact sources configured.</div>'}</div></section></div>${renderDecisionJumpScript()}`;
}
