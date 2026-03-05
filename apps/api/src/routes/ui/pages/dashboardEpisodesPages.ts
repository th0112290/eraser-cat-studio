type DashboardPageBodyInput = {
  flash: string;
  overall: string;
  dbStatus: string;
  redisStatus: string;
  minioStatus: string;
  queueReady: string;
};

type EpisodesPageBodyInput = {
  flash: string;
  styleOptions: string;
  defaultHookBoost: number;
  rows: string;
  autoRefreshScript: string;
};

export function buildDashboardPageBody(input: DashboardPageBodyInput): string {
  return `
<section class="card dashboard-shell"><h1>대시보드</h1>
${input.flash}
<section class="card" style="margin-bottom:12px;border:1px solid #b9d3ff;background:linear-gradient(180deg,#f4f8ff,#eef5ff)">
  <h2 style="margin:0 0 8px">메인 시작점: 통합 스튜디오</h2>
  <p style="margin:0 0 10px;color:#425466">캐릭터 생성, 에셋 업로드, 캐릭터팩 선택, 에피소드/렌더/퍼블리시를 한 화면에서 진행합니다.</p>
  <div class="actions">
    <a href="/ui/studio" class="secondary" style="padding:9px 12px;border-radius:10px;border:1px solid #c5d7eb">통합 스튜디오 열기</a>
    <a href="/ui/character-generator" class="secondary" style="padding:9px 12px;border-radius:10px;border:1px solid #c5d7eb">상세 생성기(고급)</a>
  </div>
</section>
<div class="grid two">
  <div class="card">
    <h2>시스템 상태</h2>
    <div class="status-list">
      <div class="status-row"><span class="label">health</span>${input.overall}</div>
      <div class="status-row"><span class="label">database</span>${input.dbStatus}</div>
      <div class="status-row"><span class="label">redis</span>${input.redisStatus}</div>
      <div class="status-row"><span class="label">minio</span>${input.minioStatus}</div>
      <div class="status-row"><span class="label">queueReady</span>${input.queueReady}</div>
    </div>
    <p style="margin:10px 0 0"><a href="/ui/health">전체 헬스 리포트 열기</a></p>
  </div>
  <div class="card">
    <h2>빠른 실행</h2>
    <div class="quick-grid">
      <form method="post" action="/ui/actions/demo-extreme" class="form-card">
        <h3>Demo Extreme</h3>
        <div class="field"><small>환경 점검과 파이프라인 스모크를 빠르게 실행합니다.</small></div>
        <div class="actions"><button type="submit" data-primary-action="1">Demo Extreme 실행</button></div>
      </form>
      <form method="post" action="/ui/actions/generate-preview" class="form-card">
        <h3>Preview Render</h3>
        <div class="field"><label for="preview-topic">Preview topic</label><input id="preview-topic" name="topic" value="UI Preview Demo"/><small>스크립트/샷 생성 주제로 사용됩니다.</small></div>
        <div class="field"><label for="preview-duration">targetDurationSec</label><input id="preview-duration" name="targetDurationSec" value="600"/><small>권장 범위: 120 ~ 900초</small></div>
        <div class="actions"><button type="submit">Preview Render 시작</button></div>
      </form>
      <form method="post" action="/ui/actions/generate-full" class="form-card">
        <h3>Final + Package</h3>
        <div class="field"><label for="full-topic">Full pipeline topic</label><input id="full-topic" name="topic" value="UI Full Pipeline Demo"/><small>최종 렌더 + 패키징용 주제입니다.</small></div>
        <div class="field"><label for="full-duration">targetDurationSec</label><input id="full-duration" name="targetDurationSec" value="600"/><small>최종 출력 목표 길이입니다.</small></div>
        <div class="actions"><button type="submit" class="secondary">Final + Package 실행</button></div>
      </form>
    </div>
  </div>
</div>
</section>

<section class="card"><h2>Control Plane</h2>
<div class="link-grid">
<a href="/ui/studio">통합 스튜디오</a>
<a href="/ui/jobs">작업</a>
<a href="/ui/assets">에셋</a>
<a href="/ui/characters">캐릭터</a>
<a href="/ui/character-generator">캐릭터 생성기</a>
<a href="/ui/hitl">검수(HITL)</a>
<a href="/ui/episodes">에피소드</a>
<a href="/ui/publish">퍼블리시</a>
<a href="/ui/health">헬스 리포트</a>
</div>
</section>

<section class="card"><h2>Quick Dev Guide</h2>
<ol>
<li>Start infra: <code>pnpm docker:up</code></li>
<li>Run DB migration: <code>pnpm db:migrate</code></li>
<li>Run API: <code>pnpm -C apps/api run dev</code></li>
<li>Run Worker: <code>pnpm -C apps/worker run dev</code></li>
</ol>
<div class="guide-grid">
<button type="button" data-copy="pnpm docker:up">Copy docker:up</button>
<button type="button" data-copy="pnpm db:migrate">Copy db:migrate</button>
<button type="button" data-copy="pnpm -C apps/api run dev">Copy api dev</button>
<button type="button" data-copy="pnpm -C apps/worker run dev">Copy worker dev</button>
</div>
</section>`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  return `
<section class="card dashboard-shell">
  <h1>Episodes</h1>
  ${input.flash}
  <form method="post" action="/ui/episodes" class="quick-grid">
    <div class="form-card">
      <h3>Basic Info</h3>
      <div class="field">
        <label for="episode-topic">topic</label>
        <input id="episode-topic" name="topic" required data-tooltip="Example: Q4 growth analysis"/>
        <small>Main topic for generated episode.</small>
      </div>
      <div class="field">
        <label for="episode-channel">channelId(optional)</label>
        <input id="episode-channel" name="channelId"/>
      </div>
      <div class="field">
        <label for="episode-duration">targetDurationSec</label>
        <input id="episode-duration" name="targetDurationSec" value="600"/>
      </div>
    </div>
    <div class="form-card">
      <h3>Pipeline Options</h3>
      <div class="field">
        <label for="episode-jobType">jobType</label>
        <select id="episode-jobType" name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select>
      </div>
      <div class="field">
        <label for="episode-pipelineMode">pipelineMode</label>
        <select id="episode-pipelineMode" name="pipelineMode"><option value="preview">preview-only</option><option value="full">full(final+package)</option><option value="manual">manual</option></select>
      </div>
      <div class="field">
        <label for="episode-stylePreset">stylePreset <span class="hint" data-tooltip="AUTO selects style from snapshot tone/speed/KPI">?</span></label>
        <select id="episode-stylePreset" name="stylePresetId">${input.styleOptions}</select>
      </div>
      <div class="field">
        <label for="episode-hookBoost">hookBoost(0~1)</label>
        <input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${input.defaultHookBoost}</output>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1">Create Episode + Enqueue</button></div>
    </div>
  </form>
</section>
<section class="card">
  <div class="section-head">
    <h2>Latest Episodes</h2>
    <div class="quick-links"><a href="/ui/jobs">Open Jobs</a><a href="/ui/artifacts">Open Artifacts</a></div>
  </div>
  <p class="notice">List auto-refreshes every 7 seconds. Press <span class="kbd">/</span> to focus search.</p>
  <div class="table-tools">
    <input type="search" data-table-filter="episodes-table" placeholder="Search by id/topic/status"/>
    <span class="muted-text">Filtering only hides rows on current page.</span>
  </div>
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Channel</th><th>Style</th><th>Latest Job</th><th>Duration</th><th>Created</th><th>Quick Run</th></tr></thead><tbody>${input.rows || '<tr><td colspan="9"><div class="notice">No episodes yet. Create one above.</div></td></tr>'}</tbody></table></div>
</section>${input.autoRefreshScript}`;
}
