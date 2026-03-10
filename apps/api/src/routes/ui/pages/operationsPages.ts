import { renderTableEmptyRow, UI_TEXT } from "./uiText";

type JobsPageBodyInput = {
  flash: string;
  rows: string;
};

type PublishPageBodyInput = {
  flash: string;
  episodeId: string;
};

type JobDetailPageBodyInput = {
  flash: string;
  jobId: string;
  episodeId: string;
  type: string;
  statusBadge: string;
  progress: string;
  attempts: string;
  errorStack: string;
  retryAction: string;
  logRows: string;
};

type HitlPageBodyInput = {
  flash: string;
  episodeIdValue: string;
  failedShotIdsValue: string;
  rows: string;
};

type ArtifactsPageBodyInput = {
  flash: string;
  episodeId: string;
  episodeLinks: string;
  rows: string;
};

type RolloutsPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  rows: string;
};

type BenchmarksPageBodyInput = {
  flash: string;
  summaryCards: string;
  sourceRows: string;
  backendRows: string;
  regressionRows: string;
};

function renderSearchCluster(input: {
  id: string;
  targetId: string;
  label: string;
  placeholder: string;
  hint: string;
}): string {
  return `<div class="search-cluster"><label for="${input.id}">${input.label}</label><input id="${input.id}" name="q" type="search" data-table-filter="${input.targetId}" placeholder="${input.placeholder}" autocomplete="off"/><span class="muted-text">${input.hint}</span></div>`;
}

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Queue Operations</span>
      <h1>${t.title}</h1>
      <p class="lede">Track the latest 100 jobs, jump into the related episode, and hand off to publish or artifact inspection without breaking your scan loop.</p>
      <div class="hero-actions">
        <a href="/ui/episodes" class="secondary">Episodes</a>
        <a href="/ui/hitl" class="secondary">HITL</a>
        <a href="/ui/publish" class="secondary">Publish</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>Queue Notes</h3>
      <p class="section-intro">Newest jobs appear first. Use the filter below to narrow to one episode, one failure mode, or one queue lane while the worker keeps running.</p>
      <div class="status-list">
        <div class="status-row"><span class="label">${t.latest}</span><span class="badge muted">${t.latestBadge}</span></div>
      </div>
    </aside>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Recent Queue Activity</h2>
      <p class="section-intro">Each row includes direct handoff links so operators do not have to manually copy episode IDs.</p>
    </div>
  </div>
  ${renderSearchCluster({
    id: "jobs-filter",
    targetId: "jobs-table",
    label: "Filter jobs",
    placeholder: t.filterPlaceholder,
    hint: "Filter is applied locally to the current page snapshot."
  })}
  <div class="quick-links"><a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a><a href="/ui/artifacts">Artifacts</a></div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeQuickLinks = input.episodeId
    ? `<div class="quick-links"><a href="/ui/episodes/${input.episodeId}">Open episode detail</a><a href="/ui/artifacts?episodeId=${input.episodeId}">Open artifacts for this episode</a></div>`
    : `<div class="notice">Prefill this page from Episodes, Jobs, or HITL when you want a faster handoff into publish.</div>`;
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Release Hand-off</span>
      <h1>${t.title}</h1>
      <p class="lede">The safest publish path is to arrive here from an episode, job, or artifact context with the episode ID already filled in.</p>
      <div class="hero-actions">
        <a href="/ui/jobs" class="secondary">Jobs</a>
        <a href="/ui/episodes" class="secondary">Episodes</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>Before You Publish</h3>
      <p class="section-intro">${t.statusHint}</p>
      <div class="status-list">
        <div class="status-row"><span class="label">Recommended state</span><strong>COMPLETED or PREVIEW_READY</strong></div>
        <div class="status-row"><span class="label">Input</span><strong>Episode ID only</strong></div>
      </div>
    </aside>
  </div>
</section>

<section class="card">
  <div class="split-grid">
    <form method="post" action="/ui/publish" class="form-card">
      <h2>Publish Request</h2>
      <div class="field">
        <label for="publish-episode-id">Episode ID</label>
        <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
        <small>${t.episodeHelp}</small>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
    </form>
    <div class="form-card">
      <h2>Context Links</h2>
      <p class="card-intro">Keep the verification surfaces close so publish stays one operator loop instead of a tab hunt.</p>
      ${episodeQuickLinks}
    </div>
  </div>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Execution Trace</span>
      <h1>Job Detail</h1>
      <p class="lede">Use this page to retry failed jobs, inspect the last error, and move directly into publish or artifact follow-up.</p>
      <div class="hero-actions">
        <a href="/ui/episodes/${input.episodeId}" class="secondary">Open Episode</a>
        <a href="/ui/publish?episodeId=${input.episodeId}" class="secondary">Open Publish</a>
        <a href="/ui/artifacts?episodeId=${input.episodeId}" class="secondary">Artifacts</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>Current Status</h3>
      <div class="status-list">
        <div class="status-row"><span class="label">Job ID</span><strong>${input.jobId}</strong></div>
        <div class="status-row"><span class="label">Type</span><strong>${input.type}</strong></div>
        <div class="status-row"><span class="label">Status</span>${input.statusBadge}</div>
      </div>
    </aside>
  </div>
</section>

<section class="card">
  <div class="grid two">
    <div class="form-card">
      <h2>Execution Summary</h2>
      <div class="field"><label>Episode</label><div><a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a></div></div>
      <div class="field"><label>Progress</label><div>${input.progress}%</div></div>
      <div class="field"><label>Attempts</label><div>${input.attempts}</div></div>
      <div class="actions">${input.retryAction}</div>
    </div>
    <div class="form-card">
      <h2>Failure Context</h2>
      <p class="card-intro">The full stack is preserved below, but the page keeps it collapsed until you need it.</p>
      ${input.errorStack}
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Job Logs</h2>
      <p class="section-intro">Search the current log snapshot, then expand only the detail blocks that matter.</p>
    </div>
  </div>
  ${renderSearchCluster({
    id: "job-log-filter",
    targetId: "job-log-table",
    label: "Filter job logs",
    placeholder: "Search logs",
    hint: "Large detail payloads are collapsed by default."
  })}
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "No logs found.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Manual Recovery</span>
      <h1>${t.title}</h1>
      <p class="lede">Target a failed episode, rerender only the bad shots, and keep the recovery path tight with direct links back to jobs and publish.</p>
      <div class="hero-actions">
        <a href="/ui/jobs" class="secondary">Jobs</a>
        <a href="/ui/publish" class="secondary">Publish</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>Shot ID Format</h3>
      <p class="section-intro">${t.failedShotHint}</p>
      <div class="status-list">
        <div class="status-row"><span class="label">Example</span><strong>shot_1,shot_2</strong></div>
      </div>
    </aside>
  </div>
</section>

<section class="card">
  <form method="post" action="/ui/hitl/rerender" class="split-grid">
    <div class="form-card">
      <h2>Rerender Request</h2>
      <div class="field"><label for="hitl-episode-id">Episode ID</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">Failed shot IDs</label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHelp}</small></div>
      <label class="toggle-pill" for="hitl-dry-run"><input id="hitl-dry-run" type="checkbox" name="dryRun" value="true"/> Dry run</label>
      <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
    </div>
    <div class="form-card">
      <h2>Recovery Loop</h2>
      <p class="card-intro">Run the rerender here, confirm the new job in Jobs, then hand off to publish when the episode is back in a good state.</p>
      <div class="quick-links"><a href="/ui/jobs">Open Jobs</a><a href="/ui/publish">Open Publish</a><a href="/ui/artifacts">Open Artifacts</a></div>
    </div>
  </form>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">Failures stay searchable, and each row can hand off directly to the next operator action.</p>
    </div>
  </div>
  ${renderSearchCluster({
    id: "hitl-filter",
    targetId: "hitl-failed-table",
    label: "Filter failed jobs",
    placeholder: t.filterPlaceholder,
    hint: "Filter by job ID, episode ID, type, or error text."
  })}
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  return `
<section class="card dashboard-shell">
  ${input.flash}
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Output Index</span>
      <h1>${t.title}</h1>
      <p class="lede">Inspect the <code>out/</code> tree, then narrow to one episode when you want fast access to preview, final, QC, and upload manifests.</p>
      <div class="hero-actions">
        <a href="/artifacts/" class="secondary">${t.openArtifacts}</a>
        <a href="/ui/episodes" class="secondary">${t.openEpisodes}</a>
      </div>
    </div>
    <aside class="hero-panel">
      <h3>Recommended Flow</h3>
      <p class="section-intro">Start from an episode when possible so the quick links below can take you straight to the exact output set you need.</p>
    </aside>
  </div>
</section>

<section class="card">
  <div class="split-grid">
    <form method="get" action="/ui/artifacts" class="form-card">
      <h2>Episode Quick Links</h2>
      <div class="field"><label for="artifact-episode-id">Episode ID</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div>
      <div class="actions"><button type="submit" class="secondary" data-primary-action="1">${t.quickLinkAction}</button></div>
    </form>
    <div class="form-card">
      <h2>Resolved Links</h2>
      ${input.episodeLinks || `<div class="empty-state"><strong>No episode selected.</strong><span class="muted-text">Enter an episode ID to expose preview, final, QC, and manifest shortcuts.</span></div>`}
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>${t.indexTitle}</h2>
      <p class="section-intro">The root index remains searchable so you can find a directory or artifact quickly even before drilling into an episode.</p>
    </div>
  </div>
  ${renderSearchCluster({
    id: "artifacts-filter",
    targetId: "artifact-index-table",
    label: "Filter out index",
    placeholder: t.indexFilterPlaceholder,
    hint: "Filter by file name or path."
  })}
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;
  return `
<section class="card dashboard-shell">
  <div class="section-head">
    <div>
      <h1>${t.title}</h1>
      <p class="section-intro">${t.subtitle}</p>
    </div>
    <div class="quick-links"><a href="/ui/health">${t.openHealth}</a><a href="/ui/profiles">Profiles</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>
<section class="card dashboard-shell">
  <div class="section-head">
    <h2>${t.sourcesTitle}</h2>
    <span class="muted-text">${t.sourcesHint}</span>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>
<section class="card">
  <div class="section-head"><h2>${t.tableTitle}</h2><input type="search" data-table-filter="rollouts-table" aria-label="Filter rollout signals" placeholder="${t.filterPlaceholder}"/></div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>Signal</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th><th>Generated</th><th>Source</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>`;
}

export function buildBenchmarksPageBody(input: BenchmarksPageBodyInput): string {
  const t = UI_TEXT.benchmarks;
  return `
<section class="card dashboard-shell">
  <div class="section-head">
    <div>
      <h1>${t.title}</h1>
      <p class="section-intro">${t.subtitle}</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/profiles">Profiles</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>
<section class="card dashboard-shell">
  <div class="section-head">
    <h2>${t.sourcesTitle}</h2>
    <span class="muted-text">${t.sourcesHint}</span>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>
<section class="card">
  <div class="section-head"><h2>${t.backendTitle}</h2><input type="search" data-table-filter="benchmark-backend-table" aria-label="Filter backend benchmark matrix" placeholder="${t.backendFilterPlaceholder}"/></div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>Scenario</th><th>Status</th><th>Latency</th><th>Acceptance</th><th>Failure Rate</th><th>Notes</th><th>Source</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>
<section class="card">
  <div class="section-head"><h2>${t.regressionTitle}</h2><input type="search" data-table-filter="benchmark-regression-table" aria-label="Filter episode regression reports" placeholder="${t.regressionFilterPlaceholder}"/></div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>Bundle</th><th>Status</th><th>Warnings / Errors</th><th>Profiles</th><th>Render Drift</th><th>Issues</th><th>Source</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>`;
}
