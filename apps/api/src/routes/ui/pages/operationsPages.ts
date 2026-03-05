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

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;
  return `
<section class="card dashboard-shell">
  <h1>${t.title}</h1>
  ${input.flash}
  <div class="status-row"><span class="label">${t.latest}</span><span class="badge muted">${t.latestBadge}</span></div>
  <div class="table-tools">
    <input type="search" data-table-filter="jobs-table" placeholder="${t.filterPlaceholder}"/>
    <div class="quick-links"><a href="/ui">Dashboard</a><a href="/ui/hitl">HITL</a></div>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  return `
<section class="card dashboard-shell">
  <h1>${t.title}</h1>
  ${input.flash}
  <div class="quick-links"><a href="/ui/jobs">Jobs</a><a href="/ui/episodes">Episodes</a></div>
  <form method="post" action="/ui/publish" class="form-card">
    <div class="field">
      <label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label>
      <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
      <small>${t.statusHint}</small>
    </div>
    <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
  </form>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Job Detail</h1>
  ${input.flash}
  <div class="grid two">
    <div class="form-card">
      <div class="field"><label>jobId</label><div><strong>${input.jobId}</strong></div></div>
      <div class="field"><label>episodeId</label><div><a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a></div></div>
      <div class="field"><label>type</label><div>${input.type}</div></div>
    </div>
    <div class="form-card">
      <div class="field"><label>status</label><div>${input.statusBadge}</div></div>
      <div class="field"><label>progress</label><div>${input.progress}%</div></div>
      <div class="field"><label>attempts</label><div>${input.attempts}</div></div>
    </div>
  </div>
  ${input.errorStack}
  <div class="actions">
    ${input.retryAction}
    <a href="/artifacts/${input.episodeId}/">Open artifact folder</a>
    <a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">Artifacts quick links</a>
  </div>
</section>
<section class="card">
  <div class="section-head"><h2>Job Logs</h2><input type="search" data-table-filter="job-log-table" placeholder="Search logs"/></div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "No logs found.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  return `
<section class="card dashboard-shell">
  <h1>${t.title}</h1>
  ${input.flash}
  <form method="post" action="/ui/hitl/rerender" class="quick-grid">
    <div class="form-card">
      <div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div>
      <label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun</label>
      <div class="actions"><button type="submit" data-primary-action="1">${t.runAction}</button></div>
    </div>
  </form>
</section>
<section class="card">
  <div class="section-head"><h2>${t.failedJobs}</h2><input type="search" data-table-filter="hitl-failed-table" placeholder="${t.filterPlaceholder}"/></div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  return `
<section class="card dashboard-shell">
  <h1>${t.title}</h1>
  ${input.flash}
  <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a></div>
  <form method="get" action="/ui/artifacts" class="form-card">
    <div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div>
    <div class="actions"><button type="submit" class="secondary" data-primary-action="1">${t.quickLinkAction}</button></div>
  </form>
  ${input.episodeLinks}
</section>
<section class="card">
  <div class="section-head"><h2>${t.indexTitle}</h2><input type="search" data-table-filter="artifact-index-table" placeholder="${t.indexFilterPlaceholder}"/></div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>`;
}

