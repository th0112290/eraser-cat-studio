export const UI_TEXT = {
  assets: {
    title: "Assets (Advanced View)",
    intro: "Use Studio for the fast flow. This page is for asset inspection and advanced checks.",
    upload: "Upload",
    uploadResultIdle: "Waiting",
    uploadInProgress: "Uploading...",
    uploadAction: "Upload + start asset processing",
    recentAssets: "Recent Assets",
    filterPlaceholder: "Search by ID / type / status",
    selectedAsset: "Selected Asset",
    noAssets: "No assets found.",
    noSelectedAsset: "No asset selected.",
    noPreviewImages: "No preview images available.",
    openJson: "Open JSON",
    openPreview: "Open",
    localPreviewMissing: "Local preview file is missing.",
    columns: {
      id: "ID",
      type: "Type",
      status: "Status",
      qc: "QC",
      mime: "MIME",
      size: "Size",
      created: "Created At"
    }
  },
  episodes: {
    title: "Episodes",
    recent: "Recent Episodes",
    createAndEnqueue: "Create episode + enqueue",
    quickLinksJobs: "Open Jobs",
    quickLinksArtifacts: "Open Artifacts",
    listHint: "The list auto-refreshes every 7 seconds. Press / to focus search.",
    tableFilterPlaceholder: "Search id / topic / status",
    localFilterHint: "Filtering is applied to the current page only.",
    noEpisodes: "No episodes yet."
  },
  jobs: {
    title: "Jobs",
    latest: "Latest 100 jobs",
    latestBadge: "Newest first",
    filterPlaceholder: "Search by job ID / episode / status",
    noJobs: "No jobs yet. Start one from dashboard or episodes."
  },
  hitl: {
    title: "HITL Rerender",
    runAction: "Run selected rerender",
    failedJobs: "Failed Jobs",
    filterPlaceholder: "Search by job / episode / error",
    failedShotHelp: "Format: shot_1,shot_2",
    failedShotHint: "Separate multiple values with commas.",
    noFailedJobs: "No failed jobs right now."
  },
  publish: {
    title: "Publish",
    runAction: "Run publish",
    episodeHelp: "Use an Episode Detail id value.",
    statusHint: "Recommended when episode status is COMPLETED or PREVIEW_READY."
  },
  artifacts: {
    title: "Artifacts",
    openArtifacts: "Open /artifacts",
    openEpisodes: "Open Episodes",
    quickLinkAction: "Open Quick Links",
    episodeHelp: "Show quick links for this episode.",
    indexTitle: "out/ index",
    indexFilterPlaceholder: "Search by file / path",
    noArtifacts: "No artifacts found."
  },
  rollouts: {
    title: "Rollouts",
    subtitle: "Benchmark and rollout JSON artifacts across local, sidecar, and main-repo out/ roots.",
    openHealth: "Open Health",
    openArtifacts: "Open Artifacts",
    sourcesTitle: "Artifact Sources",
    sourcesHint: "The board scans candidate out/ roots in priority order and tolerates missing data.",
    tableTitle: "Rollout Signals",
    filterPlaceholder: "Search by signal / status / verdict / source",
    noSignals: "No rollout or benchmark artifacts found."
  },
  benchmarks: {
    title: "Benchmarks",
    subtitle: "Backend benchmark matrices and episode regression reports across local, sidecar, and main-repo out/ roots.",
    openRollouts: "Open Rollouts",
    openArtifacts: "Open Artifacts",
    sourcesTitle: "Benchmark Sources",
    sourcesHint: "The viewer scans shared out/ roots and tolerates missing JSON artifacts.",
    backendTitle: "Backend Benchmark Matrix",
    backendFilterPlaceholder: "Search by benchmark / backend / renderer / status",
    noBackendRows: "No backend benchmark matrices found.",
    regressionTitle: "Episode Regression Reports",
    regressionFilterPlaceholder: "Search by bundle / profile / issue / source",
    noRegressionRows: "No episode regression reports found."
  },
  common: {
    searchPlaceholder: "Search",
    details: "Details",
    open: "Open"
  }
} as const;

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTableEmptyRow(colspan: number, message: string): string {
  return `<tr><td colspan="${colspan}"><div class="notice">${esc(message)}</div></td></tr>`;
}

export function renderInlineError(message: string): string {
  return `<div class="error">${esc(message)}</div>`;
}
