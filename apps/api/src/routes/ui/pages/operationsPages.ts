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

const OPERATOR_PATTERN_STYLE = `<style>
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:10px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-actions-list,.ops-mini-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.ops-actions-list li,.ops-mini-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:6px 0;border-top:1px solid #e1eaef}
.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.ops-actions-list li span:first-child,.ops-mini-list li span:first-child{font-weight:700;color:#1f3340}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.ops-summary-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 9px;border:1px solid #d9e4e8;background:#fff;border-radius:10px}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-actions-list li,.ops-mini-list li,.ops-summary-line{display:grid;justify-content:stretch}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE;
}

function renderMetricCard(label: string, value: string, hint: string): string {
  return `<div class="ops-kpi"><span class="ops-kpi-label">${label}</span><div class="ops-kpi-value">${value}</div><div class="caption">${hint}</div></div>`;
}

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
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">운영 큐</span>
      <h1>${t.title}</h1>
      <p class="section-intro">최신 작업부터 훑고 실패를 빠르게 확인한 뒤, 중간 설명 화면 없이 바로 에피소드, 산출물, 퍼블리시 흐름으로 이어갑니다.</p>
    </div>
    <div class="quick-links"><a href="/ui">대시보드</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("범위", "<strong>최근 100개 작업</strong>", "최신순으로 배치해 재시도와 신규 실패가 상단에 남게 합니다.")}
    ${renderMetricCard("기본 액션", "<strong>작업 상세 확인</strong>", "재시도, 로그, 자세한 실패 맥락이 필요하면 작업 행을 여세요.")}
    ${renderMetricCard("오브젝트 인계", "<strong>에피소드 열기</strong>", "연결된 에피소드에서 렌더, 산출물, 퍼블리시 후속 조치를 이어갑니다.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>필터 + 복구 경로</h2>
      <p class="section-intro">운영자가 한 번에 읽고 움직일 수 있도록 검색, 행 액션 리듬, 복구 경로를 표보다 먼저 둡니다.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "jobs-filter",
      targetId: "jobs-table",
      label: "작업 필터",
      placeholder: t.filterPlaceholder,
      hint: "작업 id, 에피소드 링크 텍스트, 타입, 상태로 검색합니다. / 키를 누르면 포커스가 이동합니다."
    })}
    <div class="form-card">
      <h3>행 액션 리듬</h3>
      <ul class="ops-actions-list">
        <li><span>작업 확인</span><span class="muted-text">작업 id 링크에서 로그, 재시도, lastError 맥락을 확인합니다.</span></li>
        <li><span>에피소드 열기</span><span class="muted-text">에피소드 링크에서 렌더, 산출물, 퍼블리시 흐름을 계속 이어갑니다.</span></li>
        <li><span>실패 샷 트리아지</span><span class="muted-text">운영자 입력 기반 재렌더가 필요하면 HITL로 이동합니다.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>복구 가시화</h3>
      <ul class="ops-actions-list">
        <li><span>큐가 멈춘 것 같음</span><span class="muted-text">여러 작업을 재시도하기 전에 상태 화면을 먼저 확인하세요.</span></li>
        <li><span>산출물 누락</span><span class="muted-text">관련 에피소드를 열고 해당 오브젝트의 산출물을 확인하세요.</span></li>
        <li><span>퍼블리시 차단</span><span class="muted-text">퍼블리시 전에 최신 작업 상태와 오브젝트 출력을 검증하세요.</span></li>
      </ul>
      <div class="quick-links"><a href="/ui/health">상태</a><a href="/ui/artifacts">산출물</a><a href="/ui/episodes">에피소드</a></div>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>작업 큐</h2>
      <p class="section-intro">이 화면의 핵심은 표입니다. 첫 두 열의 링크가 기본 점검 및 후속 조치 경로입니다.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>작업 / 점검</th><th>에피소드 / 이어서 진행</th><th>타입</th><th>상태</th><th>진행률</th><th>생성 시각</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>실패 작업</h3>
      <p>먼저 작업을 열어 로그와 재시도 가능 여부를 확인하세요. 특정 failed shot id로 재렌더해야 하면 HITL을 사용합니다.</p>
      <div class="quick-links"><a href="/ui/hitl">HITL 열기</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>출하 준비 완료</h3>
      <p>최신 오브젝트가 완료됐고 산출물이 존재하면 운영 흐름을 벗어나지 않고 바로 퍼블리시로 이동하세요.</p>
      <div class="quick-links"><a href="/ui/publish">퍼블리시 열기</a><a href="/ui/artifacts">산출물</a></div>
    </div>
    <div class="ops-callout">
      <h3>키보드 경로</h3>
      <p><span class="kbd">/</span> 키로 검색하고 필요한 행을 연 뒤, 재시도와 다운스트림 인계를 오브젝트 중심으로 유지하세요.</p>
    </div>
  </div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeId = input.episodeId.trim();
  const hasEpisodeId = episodeId.length > 0;
  const episodeHref = hasEpisodeId ? `/ui/episodes/${encodeURIComponent(episodeId)}` : "/ui/episodes";
  const artifactsHref = hasEpisodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "/ui/artifacts";
  const folderHref = hasEpisodeId ? `/artifacts/${encodeURIComponent(episodeId)}/` : "/artifacts/";
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>episode id를 입력하세요</strong>";

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">출하 인계</span>
      <h1>${t.title}</h1>
      <p class="section-intro">먼저 오브젝트 컨텍스트를 확인한 뒤 퍼블리시를 제출하세요. 프리플라이트 체크리스트를 폼보다 앞에 두어 인계가 명확하고 의도적으로 이뤄지게 합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("현재 오브젝트", episodeLabel, "에피소드 상세, 작업 상세, 산출물 빠른 링크에서 본 동일한 episode id를 사용하세요.")}
    ${renderMetricCard("권장 상태", "<strong>COMPLETED / PREVIEW_READY</strong>", t.statusHint)}
    ${renderMetricCard("기본 점검", "<strong>제출 전 산출물 확인</strong>", "퍼블리시 요청 전에 에피소드 출력과 최신 작업을 검증하세요.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>프리플라이트 컨텍스트</h2>
      <p class="section-intro">제출 버튼을 누르기 전에 먼저 끝내야 하는 확인 항목들입니다.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout ${hasEpisodeId ? "ok" : "warn"}">
      <h3>에피소드 참조</h3>
      <p>${hasEpisodeId ? `작업 대상 에피소드: ${episodeLabel}. 상태, 최신 작업, 다운스트림 링크를 확인해야 하면 오브젝트 상세를 여세요.` : "퍼블리시가 하나의 명확한 오브젝트에 묶이도록 episode id에서 시작하세요."}</p>
      <div class="quick-links"><a href="${episodeHref}">${hasEpisodeId ? "에피소드 상세 열기" : "에피소드 열기"}</a></div>
    </div>
    <div class="ops-callout ${hasEpisodeId ? "ok" : ""}">
      <h3>산출물 확인</h3>
      <p>퍼블리시 전에 프리뷰/최종 출력, qc report, upload manifest를 확인하세요. 그래야 실제 오브젝트 출력에 근거한 인계가 됩니다.</p>
      <div class="quick-links"><a href="${artifactsHref}">산출물 빠른 링크</a><a href="${folderHref}">원시 산출물 폴더</a></div>
    </div>
    <div class="ops-callout">
      <h3>실패 복구</h3>
      <p>퍼블리시가 실패하면 최신 작업 상세, 에피소드 상태, 산출물 존재 여부, 서비스 상태 순으로 거슬러 올라가세요.</p>
      <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/health">상태</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>퍼블리시 요청</h2>
      <p class="section-intro">프리플라이트가 끝났다면 이 폼이 최종 인계 단계가 됩니다.</p>
    </div>
  </div>
  <form method="post" action="/ui/publish" class="form-card">
    <div class="field">
      <label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label>
      <input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/>
      <small>에피소드 상세, 작업 상세, 산출물 빠른 링크 흐름에서 복사해 사용하세요.</small>
    </div>
    <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="퍼블리시 인계 실행">${t.runAction}</button></div>
  </form>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>아직 준비되지 않음</h3>
      <p>상태나 산출물이 아직 바뀌는 중이면 여기서 멈추고, 먼저 에피소드나 작업 화면에서 오브젝트를 마무리하세요.</p>
    </div>
    <div class="ops-callout ok">
      <h3>제출 준비 완료</h3>
      <p>오브젝트 상태, 출력, 최신 작업이 모두 맞아떨어질 때 퍼블리시는 디버깅 화면이 아니라 깔끔한 최종 단계가 됩니다.</p>
    </div>
  </div>
</section>`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">작업 오브젝트</span>
      <h1>작업 상세</h1>
      <p class="section-intro">하나의 작업을 점검하고, 재시도 경로를 유지한 채, 관련 에피소드, 산출물, 퍼블리시 경로로 바로 이동합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업 목록으로</a><a href="/ui/episodes/${input.episodeId}">에피소드</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-detail-grid">
    ${renderMetricCard("작업", `<strong class="mono">${input.jobId}</strong>`, "로그, 재시도, 실패 상세를 확인하는 기본 점검 오브젝트입니다.")}
    ${renderMetricCard("에피소드", `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`, "더 넓은 맥락이 필요하면 관련 에피소드에서 다운스트림 흐름을 이어갑니다.")}
    ${renderMetricCard("타입", `<strong>${input.type}</strong>`, "파이프라인의 어느 구간에 복구가 필요한지 판단할 때 사용합니다.")}
    ${renderMetricCard("상태", input.statusBadge, "상태를 보고 점검, 재시도, 인계 중 무엇을 할지 결정합니다.")}
    ${renderMetricCard("진행률", `<strong>${input.progress}%</strong>`, "로그를 열기 전에 빠르게 보는 값입니다.")}
    ${renderMetricCard("시도 횟수", `<strong>${input.attempts}</strong>`, "이 오브젝트의 재시도 압력과 backoff 설정을 보여줍니다.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>다음 액션</h2>
      <p class="section-intro">운영자가 흐름을 다시 조립하지 않아도 되도록 복구와 다운스트림 후속 조치를 나란히 보여줍니다.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-lane">
      <h3>재시도 / 점검</h3>
      <p>이 페이지에 이미 로그와 실패 상태가 모여 있으므로 재시도는 여기서 진행하는 것이 가장 자연스럽습니다.</p>
      <div class="actions">${input.retryAction}</div>
    </div>
    <div class="ops-lane">
      <h3>관련 오브젝트</h3>
      <p>에피소드 전체, 산출물 전체, 퍼블리시 전체 맥락이 필요할 때만 작업 화면을 벗어나세요.</p>
      <div class="quick-links"><a href="/ui/episodes/${input.episodeId}">에피소드 상세</a><a href="/artifacts/${input.episodeId}/">산출물 폴더</a><a href="/ui/publish?episodeId=${encodeURIComponent(input.episodeId)}">퍼블리시 인계</a></div>
    </div>
    <div class="ops-callout warn">
      <h3>복구 순서</h3>
      <p>lastError를 읽고, 로그를 확인하고, 적절하면 재시도하세요. 실패가 작업 국소 문제가 아니면 HITL 또는 상태 화면으로 올립니다.</p>
      <div class="quick-links"><a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>실패 컨텍스트</h2>
      <p class="section-intro">가장 중요한 복구 근거를 로그 표보다 위에 둡니다.</p>
    </div>
  </div>
  ${input.errorStack}
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>작업 로그</h2>
      <p class="section-intro">재시도나 인계 전에 중요한 메시지 흐름만 검색으로 먼저 좁혀 보세요.</p>
    </div>
    <input type="search" data-table-filter="job-log-table" placeholder="로그 검색"/>
  </div>
  <div class="table-wrap"><table id="job-log-table"><thead><tr><th>생성 시각</th><th>레벨</th><th>메시지</th><th>상세</th></tr></thead><tbody>${
    input.logRows || renderTableEmptyRow(4, "로그가 없습니다.")
  }</tbody></table></div>
</section>`;
}

export function buildHitlPageBody(input: HitlPageBodyInput): string {
  const t = UI_TEXT.hitl;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">실패 트리아지</span>
      <h1>${t.title}</h1>
      <p class="section-intro">실패 작업을 점검, 재렌더, 인계해야 하는 오브젝트로 다루세요. 트리아지, 재렌더 입력, 퍼블리시 후속 조치를 한 화면에서 유지합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/publish">퍼블리시</a><a href="/ui/artifacts">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("기본 액션", "<strong>실패 작업 확인</strong>", "먼저 작업 행을 열어 로그와 자세한 실패 맥락을 확인합니다.")}
    ${renderMetricCard("운영자 입력", "<strong>episodeId + failedShotIds</strong>", "재렌더 입력을 명시적으로 유지해 복구 경로가 흐려지지 않게 합니다.")}
    ${renderMetricCard("다운스트림 인계", "<strong>산출물 후 퍼블리시</strong>", "재렌더가 성공하면 퍼블리시 전에 출력을 먼저 검증하세요.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>트리아지 입력</h2>
      <p class="section-intro">실패를 검색하고 어떤 오브젝트에 재렌더가 필요한지 결정한 뒤, 집중된 HITL 액션을 제출하세요.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "hitl-filter",
      targetId: "hitl-failed-table",
      label: "실패 작업 필터",
      placeholder: t.filterPlaceholder,
      hint: "작업, 에피소드, 주제, 타입, 오류 텍스트로 검색합니다."
    })}
    <form method="post" action="/ui/hitl/rerender" class="form-card">
      <h3>재렌더 요청</h3>
      <div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div>
      <div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div>
      <label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (실행 안 함)</label>
      <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="HITL 재렌더 실행">${t.runAction}</button></div>
    </form>
    <div class="form-card">
      <h3>재렌더 후</h3>
      <ul class="ops-actions-list">
        <li><span>새 작업 확인</span><span class="muted-text">대체 작업을 열어 로그와 진행 상태를 확인합니다.</span></li>
        <li><span>산출물 검증</span><span class="muted-text">에피소드 출력이 실제로 존재하고 최신인지 확인합니다.</span></li>
        <li><span>퍼블리시로 인계</span><span class="muted-text">재렌더 결과가 오브젝트 수준에서 확인된 뒤에만 진행합니다.</span></li>
      </ul>
      <div class="quick-links"><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a></div>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">첫 열들을 점검과 에피소드 인계 액션으로 사용하세요. 오류 텍스트를 계속 보이게 해 트리아지가 스캔 중심으로 유지되게 합니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>실패 작업</th><th>에피소드</th><th>주제</th><th>타입</th><th>생성 시각</th><th>실패 / 복구</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>실패 루프 정체</h3>
      <p>재렌더가 계속 실패하면 무작정 재시도하지 마세요. 최신 작업을 확인하고 문제가 데이터, 큐, 저장소 중 어디에 있는지 판별해야 합니다.</p>
      <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/health">상태</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>퍼블리시 인계</h3>
      <p>오브젝트가 다시 정상화되면 동일한 episode id로 산출물과 퍼블리시까지 같은 맥락을 유지하세요.</p>
    </div>
  </div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  const hasEpisodeLinks = input.episodeLinks.trim().length > 0;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">오브젝트 출력</span>
      <h1>${t.title}</h1>
      <p class="section-intro">산출물은 일반 저장소 인덱스보다 먼저 오브젝트에 연결된 출력으로 읽혀야 합니다.</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">작업</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("기본 조회 키", "<strong>episodeId</strong>", "생성 파일을 볼 때 하나의 오브젝트에 계속 앵커를 유지하세요.")}
    ${renderMetricCard("기대 출력", "<strong>beats, shots, media, QC</strong>", "원시 인덱스로 내려가기 전에 먼저 에피소드 빠른 링크를 사용하세요.")}
    ${renderMetricCard("복구", "<strong>작업으로 역추적</strong>", "파일 누락은 보통 파이프라인 앞단에서 오브젝트가 실패했다는 뜻입니다.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>오브젝트 연결 접근</h2>
      <p class="section-intro">에피소드나 작업에서 보던 동일한 오브젝트로 산출물 점검을 이어가려면 episode id에서 시작하세요.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    <form method="get" action="/ui/artifacts" class="form-card">
      <h3>에피소드 빠른 링크</h3>
      <div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div>
      <div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="에피소드 산출물 빠른 링크 불러오기">${t.quickLinkAction}</button></div>
    </form>
    <div class="ops-resource-card">
      <h3>에피소드 출력</h3>
      <p>${hasEpisodeLinks ? "이 오브젝트 수준 출력부터 먼저 보세요. 에피소드에서 생성 파일로 들어가는 가장 명확한 경로입니다." : "전체 저장소 인덱스를 훑는 대신, episode id를 입력해 오브젝트용 빠른 링크를 띄우세요."}</p>
      <div class="ops-resource-list">${hasEpisodeLinks ? input.episodeLinks : '<div class="notice">아직 에피소드 빠른 링크를 불러오지 않았습니다.</div>'}</div>
    </div>
    <div class="form-card">
      <h3>복구 경로</h3>
      <ul class="ops-actions-list">
        <li><span>shots.json 누락</span><span class="muted-text">같은 에피소드의 최근 compile 또는 beats 작업을 확인하세요.</span></li>
        <li><span>preview/final 누락</span><span class="muted-text">관련 렌더 작업 또는 재렌더 경로로 돌아가세요.</span></li>
        <li><span>upload manifest 누락</span><span class="muted-text">인계 산출물을 기대하기 전에 퍼블리시 지향 단계가 끝났는지 확인하세요.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.indexTitle}</h2>
      <p class="section-intro">더 넓은 out/ 뷰가 필요할 때만 저장소 인덱스를 보되, 기본 운영 경로는 에피소드 빠른 링크로 유지하세요.</p>
    </div>
    <input type="search" data-table-filter="artifact-index-table" aria-label="산출물 인덱스 필터" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>타입</th><th>이름</th><th>열기</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>산출물 누락</h3>
      <p>저장소 인덱스만 단독으로 진실의 원천으로 취급하지 마세요. 먼저 오브젝트를 최신 작업과 에피소드 상태로 역추적해야 합니다.</p>
      <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>퍼블리시 준비 완료</h3>
      <p>오브젝트 수준 출력이 맞춰졌다면 같은 episode id로 퍼블리시까지 이어가 인계를 단단하게 유지하세요.</p>
      <div class="quick-links"><a href="/ui/publish">퍼블리시</a></div>
    </div>
  </div>
</section>`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">판정 보드</span>
      <h1>${t.title}</h1>
      <p class="section-intro">비교 신호를 훑고 판정을 즉시 이해한 뒤, 운영자 확인이 필요한 항목은 상세 산출물로 바로 들어가세요.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">벤치마크</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>필터 + 트리아지 가이드</h2>
      <p class="section-intro">원시 산출물로 들어가기 전에 비교, 판정, 이슈 트리아지가 먼저 읽히게 유지하세요.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    ${renderSearchCluster({
      id: "rollouts-filter",
      targetId: "rollouts-table",
      label: "롤아웃 신호 필터",
      placeholder: t.filterPlaceholder,
      hint: "신호 종류, 상태, 판정, 사유, 소스로 검색합니다."
    })}
    <div class="form-card">
      <h3>읽는 순서</h3>
      <ul class="ops-actions-list">
        <li><span>상태</span><span class="muted-text">ready는 사용 가능, blocked와 below-min은 즉시 점검 대상입니다.</span></li>
        <li><span>판정</span><span class="muted-text">상세를 열기 전에 빠른 운영 요약으로 사용하세요.</span></li>
        <li><span>사유</span><span class="muted-text">단순히 상태를 반복하지 말고 왜 이 신호가 뜨는지 설명해야 합니다.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>후속 액션 리듬</h3>
      <ul class="ops-actions-list">
        <li><span>상세</span><span class="muted-text">먼저 해석된 뷰를 여세요.</span></li>
        <li><span>원시 JSON</span><span class="muted-text">정확한 소스 필드나 복사 가능한 데이터가 필요할 때 사용합니다.</span></li>
        <li><span>경로 복사</span><span class="muted-text">추적성을 잃지 않고 산출물을 인계합니다.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">각 행이 별도 설명 패널 없이도 신호, 판정, 이슈, 후속 액션을 한 번에 읽히게 해야 합니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>신호 / 액션</th><th>상태</th><th>점수</th><th>판정</th><th>사유</th><th>생성 시각</th><th>소스</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>${t.sourcesTitle}</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}

export function buildBenchmarksPageBody(input: BenchmarksPageBodyInput): string {
  const t = UI_TEXT.benchmarks;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">비교 보드</span>
      <h1>${t.title}</h1>
      <p class="section-intro">시나리오 비교, 회귀 판정, 이슈 트리아지가 즉시 읽히게 유지해 운영자가 무엇을 더 깊게 봐야 하는지 빠르게 결정할 수 있게 합니다.</p>
    </div>
  <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>트리아지 가이드 + 소스</h2>
      <p class="section-intro">표를 먼저 비교 화면으로 읽으세요. 소스 루트를 계속 보여 줘야 데이터의 신뢰도와 최신성을 판단할 수 있습니다.</p>
    </div>
  </div>
  <div class="ops-filter-grid">
    <div class="form-card">
      <h3>백엔드 매트릭스</h3>
      <ul class="ops-actions-list">
        <li><span>상태</span><span class="muted-text">시나리오 출력이 애초에 사용 가능한지 먼저 판단합니다.</span></li>
        <li><span>지연 시간 + 비율</span><span class="muted-text">메모를 보기 전에 성능과 허용률을 함께 읽으세요.</span></li>
        <li><span>산출물 링크</span><span class="muted-text">먼저 상세를 열고, 맥락이 더 필요하면 Smoke나 Plan 산출물로 이동합니다.</span></li>
      </ul>
    </div>
    <div class="form-card">
      <h3>회귀 리포트</h3>
      <ul class="ops-actions-list">
        <li><span>경고 / 오류</span><span class="muted-text">회귀에서 가장 먼저 보는 운영 트리아지 필드입니다.</span></li>
        <li><span>렌더 드리프트</span><span class="muted-text">불일치 개수로 오브젝트가 기대 렌더 모드에서 얼마나 벗어났는지 파악합니다.</span></li>
        <li><span>이슈 요약</span><span class="muted-text">상세를 열기 전에 심각도를 판단할 때 사용합니다.</span></li>
      </ul>
    </div>
  </div>
  <div class="status-list" style="margin-top:10px">${input.sourceRows}</div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">백엔드 시나리오 판정은 한 행 안에서 상태, 지연 시간, 허용률, 메모가 함께 읽혀야 합니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-backend-table" aria-label="백엔드 벤치마크 매트릭스 필터" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>시나리오 / 액션</th><th>상태</th><th>지연 시간</th><th>허용률</th><th>실패율</th><th>메모</th><th>소스</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">회귀 행은 번들이 차단인지, 경고 수준인지, 더 깊은 비교 검토 준비가 됐는지 즉시 알려줘야 합니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-regression-table" aria-label="에피소드 회귀 리포트 필터" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>번들 / 액션</th><th>상태</th><th>경고 / 오류</th><th>프로필</th><th>렌더 드리프트</th><th>이슈</th><th>소스</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>차단된 회귀</h3>
      <p>회귀 행에서 시작하고, 상세와 후보 비교 산출물을 연 뒤, 문제가 렌더링인지 QC인지 설정 드리프트인지 판단하세요.</p>
    </div>
    <div class="ops-callout ok">
      <h3>비교 후속 조치</h3>
      <p>벤치마크 신호에 오브젝트 단위 점검보다 더 넓은 판정 보드가 필요하면 롤아웃 화면을 사용하세요.</p>
      <div class="quick-links"><a href="/ui/rollouts">롤아웃 열기</a></div>
    </div>
  </div>
</section>`;
}
