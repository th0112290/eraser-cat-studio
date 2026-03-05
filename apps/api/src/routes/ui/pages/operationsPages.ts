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
  <h1>작업</h1>
  ${input.flash}
  <div class="status-row"><span class="label">최근 100개 작업</span><span class="badge muted">최신순 정렬</span></div>
  <div class="table-tools">
    <input type="search" data-table-filter="jobs-table" placeholder="job id / episode / status 검색"/>
    <div class="quick-links"><a href="/ui">대시보드</a><a href="/ui/hitl">검수(HITL)</a></div>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${input.rows || '<tr><td colspan="6"><div class="notice">작업 이력이 없습니다. 대시보드에서 빠른 실행을 사용해 주세요.</div></td></tr>'}</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>퍼블리시</h1>
  ${input.flash}
  <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a></div>
  <form method="post" action="/ui/publish" class="form-card">
    <div class="field">
      <label for="publish-episode-id">episodeId <span class="hint" data-tooltip="Episode Detail의 id를 붙여넣으세요">?</span></label>
      <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
      <small>COMPLETED 또는 PREVIEW_READY 상태에서 실행을 권장합니다.</small>
    </div>
    <div class="actions"><button type="submit" data-primary-action="1">퍼블리시 실행</button></div>
  </form>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>작업 상세</h1>
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
    <a href="/artifacts/${input.episodeId}/">아티팩트 폴더 열기</a>
    <a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">아티팩트 바로가기</a>
  </div>
</section>
<section class="card">
  <div class="section-head"><h2>작업 로그</h2><input type="search" data-table-filter="job-log-table" placeholder="로그 검색"/></div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${input.logRows || '<tr><td colspan="4">로그가 없습니다.</td></tr>'}</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>검수 재렌더(HITL)</h1>
  ${input.flash}
  <form method="post" action="/ui/hitl/rerender" class="quick-grid">
    <div class="form-card">
      <div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="형식: shot_1,shot_2">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>여러 개는 쉼표로 구분하세요.</small></div>
      <label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun</label>
      <div class="actions"><button type="submit" data-primary-action="1">선택 샷 재렌더</button></div>
    </div>
  </form>
</section>
<section class="card">
  <div class="section-head"><h2>실패 작업</h2><input type="search" data-table-filter="hitl-failed-table" placeholder="job/episode/error 검색"/></div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${input.rows || '<tr><td colspan="6"><div class="notice">현재 실패 작업이 없습니다.</div></td></tr>'}</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>아티팩트</h1>
  ${input.flash}
  <div class="quick-links"><a href="/artifacts/">/artifacts 열기</a><a href="/ui/episodes">에피소드</a></div>
  <form method="get" action="/ui/artifacts" class="form-card">
    <div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>해당 에피소드의 빠른 링크를 표시합니다.</small></div>
    <div class="actions"><button type="submit" class="secondary" data-primary-action="1">바로가기 열기</button></div>
  </form>
  ${input.episodeLinks}
</section>
<section class="card">
  <div class="section-head"><h2>out/ 인덱스</h2><input type="search" data-table-filter="artifact-index-table" placeholder="파일/경로 검색"/></div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${input.rows || '<tr><td colspan="3"><div class="notice">생성된 아티팩트가 없습니다.</div></td></tr>'}</tbody></table></div>
</section>`;
}
