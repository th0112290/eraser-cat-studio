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

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Jobs</h1>
  ${input.flash}
  <div class="status-row"><span class="label">Latest 100 jobs</span><span class="badge muted">Auto-sorted</span></div>
  <div class="table-tools">
    <input type="search" data-table-filter="jobs-table" placeholder="job id / episode / status search"/>
    <div class="quick-links"><a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a></div>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${input.rows || '<tr><td colspan="6"><div class="notice">No jobs yet. Run a quick action from the dashboard.</div></td></tr>'}</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Publish</h1>
  ${input.flash}
  <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a></div>
  <form method="post" action="/ui/publish" class="form-card">
    <div class="field">
      <label for="publish-episode-id">episodeId <span class="hint" data-tooltip="Paste episode id from Episode Detail">?</span></label>
      <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
      <small>Recommended for COMPLETED or PREVIEW_READY episodes.</small>
    </div>
    <div class="actions"><button type="submit" data-primary-action="1">Run Publish</button></div>
  </form>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Job Detail</h1>
  ${input.flash}
  <p>jobId: <strong>${input.jobId}</strong></p>
  <p>episodeId: <a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a></p>
  <p>type: ${input.type}</p>
  <p>status: ${input.statusBadge}</p>
  <p>progress: ${input.progress}%</p>
  <p>attempts: ${input.attempts}</p>
  ${input.errorStack}
  <div class="actions">
    ${input.retryAction}
    <a href="/artifacts/${input.episodeId}/">Open artifacts folder</a>
    <a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">Artifacts shortcuts</a>
  </div>
</section>
<section class="card">
  <div class="section-head"><h2>Job Logs</h2><input type="search" data-table-filter="job-log-table" placeholder="search logs"/></div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${input.logRows || '<tr><td colspan="4">No logs</td></tr>'}</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>HITL Rerender</h1>
  ${input.flash}
  <form method="post" action="/ui/hitl/rerender" class="quick-grid">
    <div class="form-card">
      <div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="format: shot_1,shot_2">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>Separate multiple shot ids with commas.</small></div>
      <label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun</label>
      <div class="actions"><button type="submit" data-primary-action="1">Rerender selected shots</button></div>
    </div>
  </form>
</section>
<section class="card">
  <div class="section-head"><h2>Failed Jobs</h2><input type="search" data-table-filter="hitl-failed-table" placeholder="job/episode/error search"/></div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${input.rows || '<tr><td colspan="6"><div class="notice">No failed jobs currently.</div></td></tr>'}</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Artifacts</h1>
  ${input.flash}
  <div class="quick-links"><a href="/artifacts/">Open /artifacts/</a><a href="/ui/episodes">Episodes</a></div>
  <form method="get" action="/ui/artifacts" class="form-card">
    <div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>Show quick links for this episode.</small></div>
    <div class="actions"><button type="submit" class="secondary" data-primary-action="1">Open shortcuts</button></div>
  </form>
  ${input.episodeLinks}
</section>
<section class="card">
  <div class="section-head"><h2>out/ index</h2><input type="search" data-table-filter="artifact-index-table" placeholder="file/path search"/></div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${input.rows || '<tr><td colspan="3"><div class="notice">No artifacts generated yet.</div></td></tr>'}</tbody></table></div>
</section>`;
}
