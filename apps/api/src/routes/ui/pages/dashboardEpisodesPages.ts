import { renderTableEmptyRow, UI_TEXT } from "./uiText";

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

const OPERATOR_PATTERN_STYLE = `<style>
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c5c58}
.ops-shell{display:grid;gap:10px}
.ops-titlebar{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ops-titleblock{display:grid;gap:4px;max-width:720px}
.ops-titleblock h1,.ops-titleblock h2{margin-bottom:0}
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.ops-kpi,.ops-lane,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-inline-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ops-actions-list,.ops-mini-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.ops-actions-list li,.ops-mini-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:6px 0;border-top:1px solid #e1eaef}
.ops-actions-list li:first-child,.ops-mini-list li:first-child{border-top:none;padding-top:0}
.ops-mini-list li span:first-child{font-weight:700;color:#1f3340}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{border-color:#9ec6c3;background:linear-gradient(180deg,#ffffff,#eef8f6);text-decoration:none}
.ops-inline-card strong{font-size:15px;letter-spacing:-.01em}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-key-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-summary-line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 9px;border:1px solid #d9e4e8;background:#fff;border-radius:10px}
@media (max-width:720px){.ops-titleblock{max-width:none}.ops-actions-list li,.ops-mini-list li,.ops-summary-line{display:grid;justify-content:stretch}}
</style>`;

function renderOpsStyle(): string {
  return OPERATOR_PATTERN_STYLE;
}

function inferTone(markup: string): "ok" | "warn" | "bad" | "muted" {
  if (markup.includes("badge bad")) return "bad";
  if (markup.includes("badge warn")) return "warn";
  if (markup.includes("badge ok")) return "ok";
  return "muted";
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

function buildDashboardRecentObjectsScript(): string {
  return `<script>(() => {
  const episodeRoot = document.getElementById('dashboard-recent-episodes');
  const jobRoot = document.getElementById('dashboard-recent-jobs');
  if (!(episodeRoot instanceof HTMLElement) || !(jobRoot instanceof HTMLElement)) return;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const badgeClass = (status) => {
    const text = String(status || '').toUpperCase();
    if (text === 'COMPLETED' || text === 'SUCCEEDED' || text === 'READY') return 'ok';
    if (text === 'FAILED' || text === 'ERROR' || text === 'DOWN') return 'bad';
    if (text === 'RUNNING' || text === 'QUEUED' || text === 'PENDING' || text === 'DEGRADED') return 'warn';
    return 'muted';
  };
  const renderEmpty = (label) => '<div class="notice">최근 ' + esc(label) + ' 항목이 없습니다.</div>';
  const renderEpisodeCard = (row) => {
    const id = String(row && row.id || '').trim();
    const topic = String(row && row.topic || id || '제목 없는 에피소드');
    const status = String(row && row.status || 'UNKNOWN');
    const duration = row && row.targetDurationSec ? String(row.targetDurationSec) + '초 목표' : '길이 정보 없음';
    const latest = Array.isArray(row && row.jobs) && row.jobs.length > 0 && row.jobs[0] && typeof row.jobs[0] === 'object'
      ? String(row.jobs[0].type || '-') + ' / ' + String(row.jobs[0].status || '-')
      : '최근 작업 없음';
    const channel = row && row.channel && typeof row.channel === 'object' && row.channel !== null
      ? String(row.channel.name || row.channel.id || '기본 채널')
      : '기본 채널';
    return '<a class="ops-inline-card" href="/ui/episodes/' + encodeURIComponent(id) + '">' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(channel) + '</span></div>' +
      '<strong>' + esc(topic) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(latest) + ' | ' + esc(duration) + '</span>' +
      '</a>';
  };
  const renderJobCard = (row) => {
    const id = String(row && row.id || '').trim();
    const type = String(row && row.type || '알 수 없는 작업');
    const status = String(row && row.status || 'UNKNOWN');
    const progress = row && row.progress != null ? String(row.progress) + '%' : '0%';
    const episodeId = String(row && row.episodeId || row && row.episode && row.episode.id || '').trim();
    const episodeLabel = row && row.episode && typeof row.episode === 'object' && row.episode !== null
      ? String(row.episode.topic || episodeId || '에피소드 링크')
      : (episodeId || '에피소드 링크');
    const inspectLinks = [
      '<a href="/ui/jobs/' + encodeURIComponent(id) + '">상세 보기</a>',
      episodeId ? '<a href="/ui/episodes/' + encodeURIComponent(episodeId) + '">에피소드</a>' : '',
      episodeId ? '<a href="/ui/artifacts?episodeId=' + encodeURIComponent(episodeId) + '">산출물</a>' : ''
    ].filter(Boolean).join('');
    return '<div class="ops-inline-card">' +
      '<div class="inline-actions"><span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span><span class="muted-text">' + esc(progress) + '</span></div>' +
      '<strong>' + esc(type) + '</strong>' +
      '<span class="muted-text">' + esc(id) + '</span>' +
      '<span class="muted-text">' + esc(episodeLabel) + '</span>' +
      '<div class="inline-actions">' + inspectLinks + '</div>' +
      '</div>';
  };
  const load = async () => {
    episodeRoot.innerHTML = '<div class="notice">최근 에피소드를 불러오는 중...</div>';
    jobRoot.innerHTML = '<div class="notice">최근 작업을 불러오는 중...</div>';
    try {
      const [episodesRes, jobsRes] = await Promise.all([
        fetch('/api/episodes', { headers: { accept: 'application/json' } }),
        fetch('/api/jobs?limit=4', { headers: { accept: 'application/json' } })
      ]);
      const episodesJson = episodesRes.ok ? await episodesRes.json() : { data: [] };
      const jobsJson = jobsRes.ok ? await jobsRes.json() : { data: [] };
      const episodes = Array.isArray(episodesJson && episodesJson.data) ? episodesJson.data.slice(0, 4) : [];
      const jobs = Array.isArray(jobsJson && jobsJson.data) ? jobsJson.data.slice(0, 4) : [];
      episodeRoot.innerHTML = episodes.length > 0 ? episodes.map(renderEpisodeCard).join('') : renderEmpty('에피소드');
      jobRoot.innerHTML = jobs.length > 0 ? jobs.map(renderJobCard).join('') : renderEmpty('작업');
      if (!episodesRes.ok) {
        episodeRoot.innerHTML = '<div class="error">에피소드 요약 새로고침 실패: ' + esc(episodesRes.status) + '</div>';
      }
      if (!jobsRes.ok) {
        jobRoot.innerHTML = '<div class="error">작업 요약 새로고침 실패: ' + esc(jobsRes.status) + '</div>';
      }
    } catch (error) {
      const message = esc(error instanceof Error ? error.message : String(error));
      episodeRoot.innerHTML = '<div class="error">에피소드 요약 새로고침 실패: ' + message + '</div>';
      jobRoot.innerHTML = '<div class="error">작업 요약 새로고침 실패: ' + message + '</div>';
    }
  };
  let timer = null;
  const start = () => {
    if (timer !== null) return;
    timer = setInterval(() => { void load(); }, 15000);
  };
  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void load();
    start();
  };
  void load();
  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
})();</script>`;
}

function buildEpisodesLiveMonitorScript(): string {
  return `<script>(() => {
  const table = document.getElementById('episodes-table');
  const live = document.getElementById('episodes-live-status');
  const lastUpdated = document.getElementById('episodes-last-updated');
  const refreshNow = document.getElementById('episodes-refresh-now');
  const autoRefresh = document.getElementById('episodes-auto-refresh');
  if (!(table instanceof HTMLTableElement)) return;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const badgeClass = (status) => {
    const text = String(status || '').toUpperCase();
    if (text === 'COMPLETED' || text === 'SUCCEEDED') return 'ok';
    if (text === 'FAILED' || text === 'ERROR') return 'bad';
    if (text === 'RUNNING' || text === 'QUEUED' || text === 'PENDING') return 'warn';
    return 'muted';
  };
  const setLive = (message, tone) => {
    if (!(live instanceof HTMLElement)) return;
    live.classList.remove('notice', 'error');
    live.classList.add(tone === 'error' ? 'error' : 'notice');
    live.textContent = message;
  };
  const updateRows = (episodes) => {
    const map = new Map();
    for (const row of episodes) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      if (!id) continue;
      map.set(id, row);
    }
    document.querySelectorAll('tr[data-episode-row]').forEach((tr) => {
      if (!(tr instanceof HTMLTableRowElement)) return;
      const id = String(tr.dataset.episodeRow || '').trim();
      if (!id || !map.has(id)) return;
      const row = map.get(id);
      const statusCell = tr.querySelector('td[data-col="status"]');
      const latestCell = tr.querySelector('td[data-col="latestJob"]');
      if (statusCell instanceof HTMLTableCellElement) {
        const status = String(row.status || 'UNKNOWN');
        statusCell.innerHTML = '<span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span>';
      }
      if (latestCell instanceof HTMLTableCellElement) {
        const latest = Array.isArray(row.jobs) && row.jobs.length > 0 ? row.jobs[0] : null;
        const latestText = latest && typeof latest === 'object'
          ? String(latest.type || '-') + ' (' + String(latest.status || '-') + ')'
          : '-';
        latestCell.textContent = latestText;
      }
    });
  };
  const stamp = () => {
    if (!(lastUpdated instanceof HTMLElement)) return;
    lastUpdated.textContent = new Date().toLocaleTimeString();
  };
  const poll = async (label) => {
      setLive(label || '최근 에피소드 상태를 새로고침하는 중...', 'notice');
      try {
        const res = await fetch('/api/episodes', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('poll failed: ' + res.status);
        const json = await res.json();
        const data = Array.isArray(json && json.data) ? json.data : [];
        updateRows(data);
        stamp();
        setLive('최근 에피소드 상태를 동기화했습니다.', 'notice');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLive('상태 새로고침 실패: ' + message, 'error');
      }
    };
  let timer = null;
  const start = () => {
    if (!(autoRefresh instanceof HTMLInputElement) || !autoRefresh.checked || document.hidden || timer !== null) return;
    timer = setInterval(() => { void poll('Refreshing recent episode states...'); }, 7000);
  };
  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  if (refreshNow instanceof HTMLButtonElement) {
    refreshNow.addEventListener('click', () => { void poll('수동 새로고침을 실행하는 중...'); });
  }
  if (autoRefresh instanceof HTMLInputElement) {
    autoRefresh.addEventListener('change', () => {
      if (autoRefresh.checked) {
        setLive('실시간 새로고침을 켰습니다.', 'notice');
        void poll('최근 에피소드 상태를 새로고침하는 중...');
        start();
        return;
      }
      stop();
      setLive('실시간 새로고침을 멈췄습니다. 수동 동기화는 지금 새로고침을 사용하세요.', 'notice');
    });
  }
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void poll('최근 에피소드 상태를 새로고침하는 중...');
    start();
  };
  void poll('최근 에피소드 상태를 새로고침하는 중...');
  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
})();</script>`;
}

export function buildDashboardPageBody(input: DashboardPageBodyInput): string {
  const healthTone = inferTone(input.overall);
  const queueTone = inferTone(input.queueReady);
  const storageTone = inferTone(input.minioStatus);

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  ${input.flash}
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">운영 보드</span>
      <h1>대시보드</h1>
      <p class="section-intro">여기서 전체 상황과 위험 신호를 먼저 확인하고, 다음 액션을 에피소드, 작업, 재렌더, 퍼블리시로 이어가세요.</p>
    </div>
    <div class="quick-links"><a href="/ui/episodes">에피소드</a><a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("전체 상태", input.overall, "새 작업을 큐에 넣기 전 가장 먼저 보는 진행 가능 여부입니다.")}
    ${renderMetricCard("데이터베이스", input.dbStatus, "메타데이터와 에피소드 상태를 안정적으로 읽을 수 있어야 합니다.")}
    ${renderMetricCard("Redis", input.redisStatus, "Queue and worker coordination depend on this staying healthy.")}
    ${renderMetricCard("Minio", input.minioStatus, "퍼블리시 인계 전에 산출물 저장소가 안정적이어야 합니다.")}
    ${renderMetricCard("큐", input.queueReady, "false면 프리뷰, 렌더, 재시도 경로가 막힐 수 있습니다.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>위험 신호</h2>
      <p class="section-intro">플랫폼 상태를 훑은 뒤 계속 진행할지 판단하고, 바로 영향을 받는 운영 동선으로 이동하세요.</p>
    </div>
    <div class="quick-links"><a href="/ui/health">상태 열기</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a></div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout ${healthTone}">
      <h3>플랫폼 상태</h3>
      <p>전체 서비스 상태: ${input.overall}. down 또는 degraded면 작업 재시도나 퍼블리시 전에 인프라를 먼저 확인하세요.</p>
    </div>
    <div class="ops-callout ${queueTone}">
      <h3>큐 준비 상태</h3>
      <p>큐 상태: ${input.queueReady}. 큐 준비 상태가 false면 새 에피소드 작업을 넣기 전에 작업 또는 상태 화면으로 이동하세요.</p>
    </div>
    <div class="ops-callout ${storageTone}">
      <h3>산출물 + 퍼블리시 경로</h3>
      <p>저장소 상태: ${input.minioStatus}. 산출물이 불안정하면 퍼블리시와 산출물 점검 모두 복구 경로가 필요할 수 있습니다.</p>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>다음 액션</h2>
      <p class="section-intro">새 작업을 빠르게 만들 때는 여기서 시작하고, 이후 세부 후속 조치는 에피소드나 작업 화면에서 이어가세요.</p>
    </div>
  </div>
  <div class="quick-grid">
    <form method="post" action="/ui/actions/demo-extreme" class="form-card">
      <h3>Demo Extreme</h3>
      <p class="section-intro">생성, 렌더, 패키징을 한 번에 점검하는 전체 E2E 기준 루프를 실행합니다.</p>
      <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="데모 파이프라인 실행">Demo Extreme 실행</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-preview" class="form-card">
      <h3>프리뷰 렌더</h3>
      <div class="field"><label for="preview-topic">프리뷰 주제</label><input id="preview-topic" name="topic" value="UI 프리뷰 데모"/><small>빠른 프리뷰 작업을 만들고, 진행 상황은 작업이나 에피소드에서 확인하세요.</small></div>
      <div class="field"><label for="preview-duration">목표 길이(초)</label><input id="preview-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>권장 범위는 120초에서 900초입니다.</small></div>
      <div class="actions"><button type="submit">프리뷰 렌더 시작</button></div>
    </form>
    <form method="post" action="/ui/actions/generate-full" class="form-card">
      <h3>최종 + 패키지</h3>
      <div class="field"><label for="full-topic">최종 파이프라인 주제</label><input id="full-topic" name="topic" value="UI 전체 파이프라인 데모"/><small>최종 렌더, 패키지 생성, 다운스트림 퍼블리시 점검까지 염두에 둔 작업을 큐에 넣습니다.</small></div>
      <div class="field"><label for="full-duration">목표 길이(초)</label><input id="full-duration" name="targetDurationSec" inputmode="numeric" value="600"/><small>프리뷰만이 아니라 퍼블리시 지향 실행일 때 사용하세요.</small></div>
      <div class="actions"><button type="submit" class="secondary">최종 + 패키지 실행</button></div>
    </form>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>오브젝트 동선</h2>
      <p class="section-intro">콘솔은 오브젝트 중심으로 유지합니다. 생성은 에피소드, 점검은 작업, 트리아지는 HITL, 출하는 퍼블리시, 검증은 산출물에서 진행합니다.</p>
    </div>
  </div>
  <div class="ops-mini-grid">
    <div class="ops-lane">
      <h3>에피소드 동선</h3>
      <p>새 에피소드 작업을 만들고 최신 상태를 본 뒤, 같은 행에서 프리뷰, 전체, 렌더 전용 실행을 이어갑니다.</p>
      <div class="quick-links"><a href="/ui/episodes">에피소드 열기</a><a href="/ui/studio">스튜디오</a></div>
    </div>
    <div class="ops-lane">
      <h3>작업 동선</h3>
      <p>큐 진행 상황을 확인하고, 로그를 열고, 실패 실행을 재시도한 뒤, 관련 에피소드나 산출물 맥락으로 이동합니다.</p>
      <div class="quick-links"><a href="/ui/jobs">작업 열기</a><a href="/ui/hitl">실패 큐</a></div>
    </div>
    <div class="ops-lane">
      <h3>출하 동선</h3>
      <p>산출물과 상태를 확인한 뒤, 에피소드 맥락을 잃지 않고 퍼블리시로 넘깁니다.</p>
      <div class="quick-links"><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a></div>
    </div>
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>최근 오브젝트 요약</h2>
      <p class="section-intro">대시보드는 개요 중심이지만, 최근 에피소드와 작업을 여기서 바로 보고 현재 오브젝트로 이동할 수 있어야 합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/episodes">전체 에피소드</a><a href="/ui/jobs">전체 작업</a></div>
  </div>
  <div class="ops-mini-grid">
    <div class="ops-lane">
      <div class="ops-table-meta"><h3>최근 에피소드</h3><span class="muted-text">자동 새로고침 동선</span></div>
      <div id="dashboard-recent-episodes" class="ops-shell"><div class="notice">최근 에피소드를 불러오는 중...</div></div>
    </div>
    <div class="ops-lane">
      <div class="ops-table-meta"><h3>최근 작업</h3><span class="muted-text">자동 새로고침 동선</span></div>
      <div id="dashboard-recent-jobs" class="ops-shell"><div class="notice">최근 작업을 불러오는 중...</div></div>
    </div>
  </div>
</section>
${buildDashboardRecentObjectsScript()}`;
}

export function buildEpisodesPageBody(input: EpisodesPageBodyInput): string {
  const t = UI_TEXT.episodes;
  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  ${input.flash}
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">에피소드 큐</span>
      <h1>${t.title}</h1>
      <p class="section-intro">목록 중심 운영 화면에서 상태를 훑고, 빠르게 필터링하고, 현재 행에서 프리뷰, 전체, 렌더 전용 흐름을 바로 실행합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/artifacts">${t.quickLinksArtifacts}</a><a href="/ui/publish">퍼블리시</a></div>
  </div>
  <div class="ops-kpi-grid">
    ${renderMetricCard("생성", "<strong>주제, 채널, 길이</strong>", "현재 목록이 안정적인지 확인한 뒤 새 에피소드를 큐에 넣으세요.")}
    ${renderMetricCard("실행", "<strong>프리뷰, 전체, 렌더 전용</strong>", "행 액션으로 실행과 후속 조치를 한 곳에서 이어갑니다.")}
    ${renderMetricCard("인계", "<strong>작업, 산출물, 퍼블리시</strong>", "현재 오브젝트를 잃지 않고 다운스트림 점검으로 이동합니다.")}
  </div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>필터 + 실시간 큐 제어</h2>
      <p class="section-intro">먼저 검색하고, 실시간 상태를 계속 보면서, 모든 에피소드에 같은 행 액션 리듬을 적용합니다.</p>
    </div>
  </div>
  <div class="ops-key-grid">
    ${renderSearchCluster({
      id: "episodes-filter",
      targetId: "episodes-table",
      label: "최근 에피소드 필터",
      placeholder: t.tableFilterPlaceholder,
      hint: `${t.localFilterHint} / 키를 누르면 검색으로 이동합니다.`
    })}
    <div class="form-card">
      <h3>실시간 모니터</h3>
      <div class="ops-toolbar">
        <label class="toggle-pill" for="episodes-auto-refresh"><input id="episodes-auto-refresh" type="checkbox" checked/> 실시간 새로고침</label>
        <button id="episodes-refresh-now" type="button" class="secondary">지금 새로고침</button>
      </div>
      <div class="ops-summary-line"><span>마지막 동기화</span><span id="episodes-last-updated" class="muted-text">첫 동기화를 기다리는 중입니다.</span></div>
      <div id="episodes-live-status" class="notice" role="status" aria-live="polite">${t.listHint}</div>
    </div>
    <div class="form-card">
      <h3>행 액션 리듬</h3>
      <ul class="ops-actions-list">
        <li><span>프리뷰</span><span class="muted-text">전체 실행이나 퍼블리시 지향 작업 전에 빠르게 확인합니다.</span></li>
        <li><span>전체</span><span class="muted-text">에피소드가 다운스트림으로 넘어갈 준비가 됐을 때 전체 파이프라인을 실행합니다.</span></li>
        <li><span>렌더</span><span class="muted-text">스크립트와 샷이 준비됐고 출력 패스만 필요할 때 사용합니다.</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.recent}</h2>
      <p class="section-intro">이 화면은 표가 중심입니다. 생성 폼보다 먼저 상태, 최근 작업, 행 액션이 읽혀야 합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">${t.quickLinksJobs}</a><a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a></div>
  </div>
  <div class="table-wrap"><table id="episodes-table"><thead><tr><th>에피소드</th><th>주제</th><th>상태</th><th>채널</th><th>스타일 / 훅</th><th>최근 작업</th><th>길이</th><th>생성 시각</th><th>실행 / 후속 조치</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(9, t.noEpisodes)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>다음 에피소드 생성</h2>
      <p class="section-intro">큐를 먼저 확인한 뒤, 이 폼으로 다음 오브젝트를 적절한 스타일 프리셋과 다운스트림 경로와 함께 추가하세요.</p>
    </div>
  </div>
  <form method="post" action="/ui/episodes" class="quick-grid">
    <div class="form-card">
      <h3>기본 컨텍스트</h3>
      <div class="field">
        <label for="episode-topic">주제</label>
        <input id="episode-topic" name="topic" required data-tooltip="예: Q4 성장 분석"/>
        <small>에피소드와 생성될 작업에서 읽기 쉬운 짧은 주제를 사용하세요.</small>
      </div>
      <div class="field">
        <label for="episode-channel">채널 ID</label>
        <input id="episode-channel" name="channelId"/>
        <small>선택 사항입니다. 비워 두면 기본 채널 컨텍스트를 유지합니다.</small>
      </div>
      <div class="field">
        <label for="episode-duration">목표 길이(초)</label>
        <input id="episode-duration" name="targetDurationSec" value="600" inputmode="numeric"/>
        <small>프리뷰 전용, 전체, 수동 흐름 중 하나를 고르기 전에 목표 실행 길이를 설정하세요.</small>
      </div>
    </div>
    <div class="form-card">
      <h3>파이프라인 설정</h3>
      <div class="field">
        <label for="episode-jobType">작업 타입</label>
        <select id="episode-jobType" name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select>
      </div>
      <div class="field">
        <label for="episode-pipelineMode">파이프라인 모드</label>
        <select id="episode-pipelineMode" name="pipelineMode"><option value="preview">프리뷰 전용</option><option value="full">전체(최종 + 패키지)</option><option value="manual">수동</option></select>
      </div>
      <div class="field">
        <label for="episode-stylePreset">스타일 프리셋</label>
        <select id="episode-stylePreset" name="stylePresetId">${input.styleOptions}</select>
        <small>AUTO는 톤과 속도감으로 선택합니다. 반복 가능한 비교 실행이 필요하면 프리셋을 고정하세요.</small>
      </div>
      <div class="field">
        <label for="episode-hookBoost">훅 부스트(0~1)</label>
        <input id="episode-hookBoost" type="range" name="hookBoost" min="0" max="1" step="0.05" value="${input.defaultHookBoost}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${input.defaultHookBoost}</output>
      </div>
      <div class="actions"><button type="submit" data-primary-action="1" data-primary-label="에피소드 생성 후 큐 등록">${t.createAndEnqueue}</button></div>
    </div>
  </form>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>복구 + 인계</h2>
      <p class="section-intro">에피소드가 정상 경로를 벗어나거나 다운스트림 작업 준비가 됐을 때, 다음 액션이 바로 보여야 합니다.</p>
    </div>
  </div>
  <div class="ops-note-grid">
    <div class="ops-callout warn">
      <h3>실패 또는 정체</h3>
      <p>행에서 최신 작업을 열고 로그를 확인한 뒤, 복구에 사람 판단이 필요하면 HITL에서 실패 샷 재렌더 경로를 사용하세요.</p>
      <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/hitl">HITL</a></div>
    </div>
    <div class="ops-callout ok">
      <h3>산출물 준비 완료</h3>
      <p>프리뷰 또는 최종 출력이 있으면 퍼블리시를 열기 전에 먼저 산출물 점검으로 이동하세요.</p>
      <div class="quick-links"><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a></div>
    </div>
    <div class="ops-callout">
      <h3>운영 단축 경로</h3>
      <p><span class="kbd">/</span> 키로 검색으로 이동하고, 실시간 새로고침을 유지한 채 행 액션 버튼으로 다음 단계를 진행하세요.</p>
    </div>
  </div>
</section>${buildEpisodesLiveMonitorScript()}`;
}
