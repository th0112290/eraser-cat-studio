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
.ops-kpi-grid,.ops-note-grid,.ops-mini-grid,.ops-filter-grid,.ops-rail-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ops-kpi,.ops-lane,.ops-resource-card,.ops-inline-card{display:grid;gap:6px;padding:10px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fff,#f7fbfc);border-radius:12px}
.ops-kpi-label{font-size:12px;font-weight:700;color:#42556a;text-transform:uppercase;letter-spacing:.08em}
.ops-kpi-value{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16px;font-weight:800}
.ops-callout{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid #d6e3e8;background:linear-gradient(180deg,#fbfefd,#f2f8f9)}
.ops-callout h3,.ops-lane h3,.ops-resource-card h3{margin:0;font-size:14px}
.ops-callout p,.ops-lane p,.ops-resource-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-callout.warn{border-color:#edd2ac;background:linear-gradient(180deg,#fffaf1,#fff3df)}
.ops-callout.bad{border-color:#efc5c8;background:linear-gradient(180deg,#fff7f7,#fff1f2)}
.ops-callout.ok{border-color:#bcdccf;background:linear-gradient(180deg,#f5fcf7,#edf8f0)}
.ops-rail-card{display:grid;gap:8px;padding:12px;border:1px solid #d6e4ea;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbfc)}
.ops-rail-card h3{margin:0;font-size:15px}
.ops-rail-card p{margin:0;color:#4f6470;line-height:1.5}
.ops-rail-card.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.ops-rail-card.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.ops-rail-card.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.ops-rail-card.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.ops-rail-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.ops-rail-item{display:grid;gap:4px;padding-top:8px;border-top:1px solid #e1eaef}
.ops-rail-item:first-child{border-top:none;padding-top:0}
.ops-rail-item strong{font-size:14px;color:#1f3340}
.ops-rail-card .quick-links{margin-top:2px}
.ops-table-shell{display:grid;gap:10px}
.ops-table-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.search-cluster{display:grid;gap:6px;padding:10px;border:1px solid #dbe7f3;background:#f8fbff;border-radius:12px}
.search-cluster label{font-size:12px;font-weight:700;color:#334155}
.search-cluster input{width:100%}
.search-cluster .muted-text{line-height:1.4}
.ops-resource-list ul{margin:0;padding-left:18px;display:grid;gap:8px}
.ops-resource-list li{line-height:1.5}
.ops-inline-card{color:inherit;text-decoration:none}
.ops-inline-card:hover{text-decoration:none}
.ops-detail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ops-form-shell{display:grid;gap:10px}
@media (max-width:720px){.ops-titleblock{max-width:none}}
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

type OpsRailTone = "ok" | "warn" | "bad" | "muted";

type OpsRailItem = {
  label: string;
  detail: string;
  html?: string;
};

type OpsRailCardInput = {
  title: string;
  intro: string;
  tone?: OpsRailTone;
  items?: OpsRailItem[];
  bodyHtml?: string;
  linksHtml?: string;
};

function inferTone(markup: string): OpsRailTone {
  if (markup.includes("badge bad")) return "bad";
  if (markup.includes("badge warn")) return "warn";
  if (markup.includes("badge ok")) return "ok";
  return "muted";
}

function renderRailItems(items: OpsRailItem[]): string {
  return `<ul class="ops-rail-list">${items
    .map(
      (item) =>
        `<li class="ops-rail-item"><strong>${item.label}</strong><span class="muted-text">${item.detail}</span>${item.html ?? ""}</li>`
    )
    .join("")}</ul>`;
}

function renderRailCard(input: OpsRailCardInput): string {
  const tone = input.tone ?? "muted";
  const bodyHtml =
    input.bodyHtml ?? ((input.items?.length ?? 0) > 0 ? renderRailItems(input.items ?? []) : '<div class="notice">표시할 항목이 없습니다.</div>');
  return `<div class="ops-rail-card tone-${tone}"><div class="stack"><h3>${input.title}</h3><p>${input.intro}</p></div>${bodyHtml}${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div>`;
}

function renderRailSection(input: {
  title: string;
  intro: string;
  linksHtml?: string;
  cards: OpsRailCardInput[];
}): string {
  return `<section class="card"><div class="section-head"><div><h2>${input.title}</h2><p class="section-intro">${input.intro}</p></div>${
    input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""
  }</div><div class="ops-rail-grid">${input.cards.map(renderRailCard).join("")}</div></section>`;
}

export function buildJobsPageBody(input: JobsPageBodyInput): string {
  const t = UI_TEXT.jobs;

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">운영 리스트</span>
      <h1>${t.title}</h1>
      <p class="section-intro">작업 리스트는 detail과 recover로 넘어가는 첫 제어면입니다. 긴 설명보다 실패, 정체, handoff 판단을 먼저 보이게 유지합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui">대시보드</a><a href="/ui/hitl">HITL</a><a href="/ui/publish">퍼블리시</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("범위", "<strong>최근 100개 작업</strong>", "최신 실패와 멈춘 실행을 위쪽에서 먼저 잡습니다.")}
    ${renderMetricCard("기본 진입", "<strong>row -> job detail</strong>", "각 행은 detail, retry, recovery 판단으로 이어지는 1차 제어면입니다.")}
    ${renderMetricCard("인계", "<strong>episode -> artifacts -> publish</strong>", "작업만으로 끝내지 않고 소유 오브젝트와 승격 경로까지 같은 흐름으로 봅니다.")}
  </div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "필터, recovery, linked objects를 먼저 정리한 뒤에만 raw row 세부로 내려갑니다.",
  linksHtml: '<a href="/ui/health">상태</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a>',
  cards: [
    {
      title: "필터 + row 오픈",
      intro: "작업 id, episode id, 상태로 좁힌 다음 첫 행에서 detail로 들어갑니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "jobs-filter",
        targetId: "jobs-table",
        label: "작업 필터",
        placeholder: t.filterPlaceholder,
        hint: "이 리스트에 로컬로 적용됩니다. / 로 전역 검색으로 바로 이동할 수 있습니다."
      })
    },
    {
      title: "복구 우선순위",
      intro: "FAILED와 멈춘 RUNNING을 먼저 정리하고, publish는 마지막에 봅니다.",
      tone: "warn",
      items: [
        { label: "FAILED 행부터 연다", detail: "job detail에서 lastError와 retry action을 확인한 뒤 HITL 여부를 판단합니다." },
        { label: "RUNNING 정체는 상태 화면 먼저", detail: "재시도 전에 health, queue, 최근 jobs를 함께 확인해 중복 실행을 피합니다." },
        { label: "publish hold", detail: "최신 작업 상태와 산출물이 맞아야만 승격으로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a>'
    },
    {
      title: "연결된 오브젝트",
      intro: "작업 행에서 episode, artifacts, publish까지 같은 오브젝트 흐름으로 이어갑니다.",
      tone: "ok",
      items: [
        { label: "소유 에피소드", detail: "render, preview, publish handoff는 episode 문맥에서 최종 확인합니다." },
        { label: "산출물", detail: "작업 성공만으로 끝내지 말고 output presence와 QC를 함께 확인합니다." },
        { label: "승격", detail: "promotion은 최신 작업과 산출물 정합이 확인된 뒤에만 진행합니다." }
      ],
      linksHtml: '<a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>작업 오브젝트</h2>
      <p class="section-intro">각 행은 object -> state -> linked object -> next action 순서로 읽습니다. raw evidence는 detail 화면으로 내립니다.</p>
    </div>
    <span class="badge muted">${t.latestBadge}</span>
  </div>
  <div class="table-wrap"><table id="jobs-table"><thead><tr><th>오브젝트 / 다음 액션</th><th>연결 에피소드 / 인계</th><th>타입</th><th>상태</th><th>진행률</th><th>생성 시각</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noJobs)
  }</tbody></table></div>
</section>`;
}

export function buildPublishPageBody(input: PublishPageBodyInput): string {
  const t = UI_TEXT.publish;
  const episodeId = input.episodeId.trim();
  const hasEpisodeId = episodeId.length > 0;
  const episodeHref = hasEpisodeId ? `/ui/episodes/${encodeURIComponent(episodeId)}` : "/ui/episodes";
  const artifactsHref = hasEpisodeId ? `/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}` : "/ui/artifacts";
  const folderHref = hasEpisodeId ? `/artifacts/${encodeURIComponent(episodeId)}/` : "/artifacts/";
  const episodeLabel = hasEpisodeId ? `<strong class="mono">${episodeId}</strong>` : "<strong>episode id를 입력하세요.</strong>";

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">승격 제어면</span>
      <h1>${t.title}</h1>
      <p class="section-intro">publish는 단일 버튼 액션이지만, 실제 판단은 episode, latest job, artifacts 정합 위에서만 안전합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/artifacts">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("현재 오브젝트", episodeLabel, "같은 episode id로 jobs, artifacts, publish를 끝까지 이어갑니다.")}
    ${renderMetricCard("권장 상태", "<strong>COMPLETED / PREVIEW_READY</strong>", t.statusHint)}
    ${renderMetricCard("검증 순서", "<strong>jobs -> artifacts -> publish</strong>", "원시 폴더보다 먼저 최신 작업과 산출물 정합을 확인합니다.")}
  </div>
</section>

${renderRailSection({
  title: "승격 전 확인",
  intro: "퍼블리시 버튼보다 먼저 현재 오브젝트, 연결 산출물, 복구 경로를 상단에서 고정합니다.",
  cards: [
    {
      title: "현재 오브젝트",
      intro: hasEpisodeId
        ? `승격 대상 episode id는 ${episodeId} 입니다. 먼저 episode detail에서 상태와 latest job을 확인합니다.`
        : "승격할 오브젝트가 아직 정해지지 않았습니다. episode id를 먼저 정하세요.",
      tone: hasEpisodeId ? "ok" : "warn",
      items: [
        { label: "episode detail", detail: "이 오브젝트의 현재 상태와 가장 최근 작업 결과를 먼저 확인합니다." },
        { label: "linked job", detail: "publish는 최신 작업이 성공 경로에 있는 경우에만 안전합니다." }
      ],
      linksHtml: `<a href="${episodeHref}">${hasEpisodeId ? "에피소드 상세" : "에피소드 목록"}</a>`
    },
    {
      title: "연결된 산출물",
      intro: "preview, final, QC, upload manifest가 모두 같은 오브젝트를 가리키는지 먼저 맞춥니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      items: [
        { label: "preview / final", detail: "승격 전 출력 파일이 실제로 존재하는지 확인합니다." },
        { label: "QC / manifest", detail: "원시 evidence보다 먼저 QC와 upload manifest를 확인합니다." }
      ],
      linksHtml: `<a href="${artifactsHref}">산출물</a><a href="${folderHref}">원시 폴더</a>`
    },
    {
      title: "막히면 돌아갈 경로",
      intro: "publish 실패는 보통 소유 작업, 상태 화면, 누락 산출물 중 하나에서 다시 풀립니다.",
      tone: "warn",
      items: [
        { label: "jobs로 복귀", detail: "latest job failure와 retry 가능 여부를 먼저 확인합니다." },
        { label: "health 확인", detail: "queue나 storage 저하가 있으면 승격을 멈추고 의존성을 먼저 복구합니다." },
        { label: "artifacts 재검증", detail: "누락 output이면 publish가 아니라 render / compile 단계로 되돌아갑니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/health">상태</a>'
    }
  ]
})}

${renderRailSection({
  title: "퍼블리시 실행",
  intro: "실행 입력은 간단하게 두되, next action과 rollback anchor는 같은 레일 안에 유지합니다.",
  cards: [
    {
      title: "퍼블리시 요청",
      intro: "episode id 하나로 승격을 실행합니다.",
      tone: hasEpisodeId ? "ok" : "muted",
      bodyHtml: `<form method="post" action="/ui/publish" class="ops-form-shell"><div class="field"><label for="publish-episode-id">episodeId <span class="hint" data-tooltip="${t.episodeHelp}">?</span></label><input id="publish-episode-id" name="episodeId" value="${input.episodeId}" placeholder="clx..." required/><small>에피소드 상세, 작업 상세, 산출물 링크에서 같은 id를 복사해 사용합니다.</small></div><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="퍼블리시 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "제출 직전 체크",
      intro: "입력값보다 정합이 더 중요합니다.",
      tone: "ok",
      items: [
        { label: "episode 상태", detail: "COMPLETED 또는 PREVIEW_READY인지 확인합니다." },
        { label: "latest job", detail: "방금 실패한 작업이 있으면 승격보다 복구를 먼저 진행합니다." },
        { label: "output manifest", detail: "upload manifest와 output presence가 맞는지 확인합니다." }
      ]
    },
    {
      title: "차단 시 복귀",
      intro: "publish가 막히면 raw folder 탐색보다 소유 오브젝트로 돌아가야 합니다.",
      tone: "warn",
      items: [
        { label: "jobs", detail: "실패한 최신 작업과 retry 가능 여부를 확인합니다." },
        { label: "artifacts", detail: "출력이 비면 render / compile 단계부터 다시 봅니다." },
        { label: "health", detail: "서비스 저하가 있으면 승격을 멈추고 복구 명령을 먼저 고릅니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}`;
}

export function buildJobDetailPageBody(input: JobDetailPageBodyInput): string {
  const statusTone = inferTone(input.statusBadge);

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">실행 오브젝트</span>
      <h1>작업 상세</h1>
      <p class="section-intro">retry, recovery, linked objects를 raw error와 logs보다 먼저 올려 두는 detail 화면입니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업 목록</a><a href="/ui/episodes/${input.episodeId}">에피소드</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(input.episodeId)}">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-detail-grid">
    ${renderMetricCard("작업", `<strong class="mono">${input.jobId}</strong>`, "이 object id를 중심으로 retry, logs, linked episode를 같이 봅니다.")}
    ${renderMetricCard("소유 에피소드", `<a href="/ui/episodes/${input.episodeId}">${input.episodeId}</a>`, "목록으로 돌아가지 않고 소유 object로 바로 handoff 합니다.")}
    ${renderMetricCard("타입", `<strong>${input.type}</strong>`, "파이프라인 어디에서 막혔는지 가장 먼저 보여 주는 분류입니다.")}
    ${renderMetricCard("상태", input.statusBadge, "상태 badge가 retry / recover / publish hold 판단을 결정합니다.")}
    ${renderMetricCard("진행률", `<strong>${input.progress}%</strong>`, "raw logs로 내려가기 전에 현재 정체 여부를 빠르게 읽습니다.")}
    ${renderMetricCard("시도 횟수", `<strong>${input.attempts}</strong>`, "반복 실패와 backoff 흔적을 빠르게 파악합니다.")}
  </div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "retry, recovery, linked objects를 먼저 고정하고 그 아래에만 failure context와 logs를 둡니다.",
  cards: [
    {
      title: "retry / inspect",
      intro: "이 화면의 1차 액션은 retry 가능 여부를 판단하는 것입니다.",
      tone: statusTone,
      bodyHtml: `<div class="stack"><span class="muted-text">상태와 lastError를 본 뒤 재실행합니다.</span><div class="actions">${input.retryAction}</div></div>`
    },
    {
      title: "복구 경로",
      intro: "작업 문제인지, 오브젝트 문제인지, 인프라 문제인지 먼저 나눕니다.",
      tone: "warn",
      items: [
        { label: "lastError 먼저", detail: "실패 원인을 읽고 동일 payload 재시도인지 경로 변경인지 구분합니다." },
        { label: "오브젝트 문제면 HITL", detail: "shot 단위나 입력 보정이 필요하면 HITL로 넘깁니다." },
        { label: "인프라 문제면 health", detail: "queue, storage, worker 저하가 보이면 재시도보다 복구를 먼저 합니다." }
      ],
      linksHtml: '<a href="/ui/hitl">HITL</a><a href="/ui/health">상태</a>'
    },
    {
      title: "연결된 오브젝트",
      intro: "detail에서 바로 episode, artifacts, publish 경로로 handoff 합니다.",
      tone: "ok",
      items: [
        { label: "에피소드 상세", detail: "소유 object 상태와 후속 렌더 경로를 확인합니다." },
        { label: "산출물 폴더", detail: "output presence 확인이 필요할 때만 raw folder로 내려갑니다." },
        { label: "퍼블리시 인계", detail: "성공 결과를 승격할 때 같은 episode id로 넘깁니다." }
      ],
      linksHtml: `<a href="/ui/episodes/${input.episodeId}">에피소드</a><a href="/artifacts/${input.episodeId}/">산출물 폴더</a><a href="/ui/publish?episodeId=${encodeURIComponent(input.episodeId)}">퍼블리시</a>`
    }
  ]
})}

<section class="card">
  <div class="section-head">
    <div>
      <h2>복구 스냅샷</h2>
      <p class="section-intro">가장 중요한 failure context만 위에 유지합니다. 이 아래부터는 2차 evidence입니다.</p>
    </div>
  </div>
  ${input.errorStack}
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>원시 로그</h2>
      <p class="section-intro">retry와 recovery 경로가 위에서 정리된 뒤에만 raw log evidence를 확인합니다.</p>
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
      <span class="eyebrow">복구 큐</span>
      <h1>${t.title}</h1>
      <p class="section-intro">실패 작업에서 recover로 넘어가는 제어면입니다. rerender, linked objects, publish handoff를 같은 흐름으로 유지합니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/jobs">작업</a><a href="/ui/publish">퍼블리시</a><a href="/ui/artifacts">산출물</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("기본 진입", "<strong>실패 작업 열기</strong>", "먼저 failed job detail에서 실제 실패 맥락을 확인합니다.")}
    ${renderMetricCard("입력", "<strong>episodeId + failedShotIds</strong>", "복구 대상 object를 명시적으로 좁혀서 rerender 합니다.")}
    ${renderMetricCard("인계", "<strong>artifacts -> publish</strong>", "복구 성공 후 바로 승격하지 말고 산출물 정합을 먼저 맞춥니다.")}
  </div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "failed row를 고르고 rerender를 실행한 뒤, 산출물과 승격 경로까지 같은 레일에서 확인합니다.",
  cards: [
    {
      title: "실패 row 좁히기",
      intro: "job, episode, topic, error text로 복구 대상을 먼저 줄입니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "hitl-filter",
        targetId: "hitl-failed-table",
        label: "실패 작업 필터",
        placeholder: t.filterPlaceholder,
        hint: "작업, 에피소드, 주제, 타입, 오류 단어로 빠르게 줄입니다."
      })
    },
    {
      title: "HITL rerender 요청",
      intro: "복구 대상 shot id를 명시하고 dryRun으로 경로를 먼저 검증할 수 있습니다.",
      tone: "warn",
      bodyHtml: `<form method="post" action="/ui/hitl/rerender" class="ops-form-shell"><div class="field"><label for="hitl-episode-id">episodeId</label><input id="hitl-episode-id" name="episodeId" value="${input.episodeIdValue}" required/></div><div class="field"><label for="hitl-shot-ids">failedShotIds <span class="hint" data-tooltip="${t.failedShotHelp}">?</span></label><input id="hitl-shot-ids" name="failedShotIds" value="${input.failedShotIdsValue}" placeholder="shot_1,shot_2" required/><small>${t.failedShotHint}</small></div><label class="muted-text"><input type="checkbox" name="dryRun" value="true"/> dryRun (실행 전 검증)</label><div class="actions"><button type="submit" data-primary-action="1" data-primary-label="HITL rerender 실행">${t.runAction}</button></div></form>`
    },
    {
      title: "복구 뒤 handoff",
      intro: "복구가 끝나도 바로 publish로 가지 말고 linked outputs를 먼저 확인합니다.",
      tone: "ok",
      items: [
        { label: "실패 job detail", detail: "원인 확인은 항상 failed job detail에서 먼저 시작합니다." },
        { label: "산출물 재검증", detail: "rerender 뒤 preview / final / QC가 실제로 갱신되었는지 확인합니다." },
        { label: "publish handoff", detail: "복구 결과가 정합한 경우에만 승격 경로로 넘깁니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/artifacts">산출물</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.failedJobs}</h2>
      <p class="section-intro">row action rhythm을 실패 object -> owning episode -> recover 순서로 통일합니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="hitl-failed-table"><thead><tr><th>실패 작업 / 다음 액션</th><th>연결 에피소드</th><th>주제</th><th>타입</th><th>생성 시각</th><th>복구 / handoff</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(6, t.noFailedJobs)
  }</tbody></table></div>
</section>`;
}

export function buildArtifactsPageBody(input: ArtifactsPageBodyInput): string {
  const t = UI_TEXT.artifacts;
  const hasEpisodeLinks = input.episodeLinks.trim().length > 0;
  const linkedOutputsHtml = hasEpisodeLinks ? input.episodeLinks : '<div class="notice">아직 에피소드 빠른 링크를 불러오지 않았습니다.</div>';

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">linked outputs</span>
      <h1>${t.title}</h1>
      <p class="section-intro">산출물 화면은 raw directory 브라우저가 아니라 linked object view입니다. episode id를 중심으로 output presence와 recovery anchor를 함께 봅니다.</p>
    </div>
    <div class="quick-links"><a href="/artifacts/">${t.openArtifacts}</a><a href="/ui/episodes">${t.openEpisodes}</a><a href="/ui/jobs">작업</a></div>
  </div>
  ${input.flash}
  <div class="ops-kpi-grid">
    ${renderMetricCard("조회 키", "<strong>episodeId</strong>", "항상 같은 오브젝트 id로 jobs, episode, publish까지 이어갑니다.")}
    ${renderMetricCard("핵심 outputs", "<strong>beats, shots, media, QC</strong>", "원시 인덱스보다 먼저 linked outputs를 확인합니다.")}
    ${renderMetricCard("복구 앵커", "<strong>jobs / episode detail</strong>", "누락 파일은 대개 상위 파이프라인 단계에서 해결됩니다.")}
  </div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "episode lookup, linked outputs, recovery anchor를 같은 화면 위쪽에 유지합니다.",
  cards: [
    {
      title: "episode lookup",
      intro: "같은 object id로 output set을 빠르게 여는 진입점입니다.",
      tone: "muted",
      bodyHtml: `<form method="get" action="/ui/artifacts" class="ops-form-shell"><div class="field"><label for="artifact-episode-id">episodeId</label><input id="artifact-episode-id" name="episodeId" value="${input.episodeId}"/><small>${t.episodeHelp}</small></div><div class="actions"><button type="submit" class="secondary" data-primary-action="1" data-primary-label="에피소드 산출물 열기">${t.quickLinkAction}</button></div></form>`
    },
    {
      title: "linked outputs",
      intro: hasEpisodeLinks
        ? "이 오브젝트와 직접 연결된 outputs를 위에서 바로 확인합니다."
        : "episode id를 입력하면 이 오브젝트의 linked outputs를 먼저 띄웁니다.",
      tone: hasEpisodeLinks ? "ok" : "muted",
      bodyHtml: `<div class="ops-resource-card"><div class="ops-resource-list">${linkedOutputsHtml}</div></div>`
    },
    {
      title: "복구 앵커",
      intro: "누락 output은 대부분 상위 파이프라인 단계에서 해결합니다.",
      tone: "warn",
      items: [
        { label: "shots.json 없음", detail: "compile_shots 또는 beats 생성 작업부터 다시 확인합니다." },
        { label: "preview / final 없음", detail: "관련 render job 또는 HITL rerender 경로로 되돌아갑니다." },
        { label: "upload manifest 없음", detail: "publish를 멈추고 linked outputs 정합부터 맞춥니다." }
      ],
      linksHtml: '<a href="/ui/jobs">작업</a><a href="/ui/episodes">에피소드</a><a href="/ui/publish">퍼블리시</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>원시 산출물 인덱스</h2>
      <p class="section-intro">이 표는 2차 evidence입니다. linked outputs와 recovery anchor를 본 뒤에만 raw index를 확인합니다.</p>
    </div>
    <input type="search" data-table-filter="artifact-index-table" aria-label="산출물 인덱스 필터" placeholder="${t.indexFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="artifact-index-table"><thead><tr><th>타입</th><th>이름</th><th>열기</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(3, t.noArtifacts)
  }</tbody></table></div>
</section>`;
}

export function buildRolloutsPageBody(input: RolloutsPageBodyInput): string {
  const t = UI_TEXT.rollouts;

  return `
${renderOpsStyle()}
<section class="card dashboard-shell ops-shell">
  <div class="ops-titlebar">
    <div class="ops-titleblock">
      <span class="eyebrow">판정 surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">rollout과 compare 신호를 raw JSON이 아니라 decision surface로 읽습니다. 판단, recovery, linked evidence를 같은 위계로 맞춥니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">벤치마크</a><a href="/ui/health">${t.openHealth}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "filter, compare read order, recovery anchor를 표 위에 고정해 판단 피로도를 줄입니다.",
  cards: [
    {
      title: "신호 필터",
      intro: "signal, status, verdict, reason, source를 기준으로 문제 묶음을 먼저 좁힙니다.",
      tone: "muted",
      bodyHtml: renderSearchCluster({
        id: "rollouts-filter",
        targetId: "rollouts-table",
        label: "롤아웃 신호 필터",
        placeholder: t.filterPlaceholder,
        hint: "신호 종류, 상태, 판정, 사유, 소스로 바로 줄입니다."
      })
    },
    {
      title: "비교 읽는 순서",
      intro: "상태보다 판정과 사유를 먼저 읽고, compare action은 그 다음에 엽니다.",
      tone: "warn",
      items: [
        { label: "status", detail: "blocked와 below-min은 즉시 차단 신호로 취급합니다." },
        { label: "verdict / reason", detail: "수치만 보지 말고 왜 막혔는지 reason을 먼저 읽습니다." },
        { label: "compare action", detail: "상세와 원시 JSON은 판단이 서지 않을 때만 엽니다." }
      ]
    },
    {
      title: "복구 / linked evidence",
      intro: "rollout signal은 benchmark, artifacts, health와 같이 묶어서 봐야 합니다.",
      tone: "ok",
      items: [
        { label: "benchmark와 비교", detail: "동일 번들의 upstream benchmark 결과를 함께 확인합니다." },
        { label: "artifacts handoff", detail: "판정 근거가 필요한 경우에만 linked outputs로 이동합니다." },
        { label: "health 확인", detail: "서비스 저하가 보이면 signal 자체보다 인프라 복구를 먼저 합니다." }
      ],
      linksHtml: '<a href="/ui/benchmarks">벤치마크</a><a href="/ui/artifacts">산출물</a><a href="/ui/health">상태</a>'
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.tableTitle}</h2>
      <p class="section-intro">각 행은 signal -> verdict -> reason -> next compare action 순서로 읽습니다.</p>
    </div>
  </div>
  <div class="table-wrap"><table id="rollouts-table"><thead><tr><th>오브젝트 / 비교 액션</th><th>상태</th><th>점수</th><th>판정</th><th>사유</th><th>생성 시각</th><th>소스</th></tr></thead><tbody>${
    input.rows || renderTableEmptyRow(7, t.noSignals)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
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
      <span class="eyebrow">compare surface</span>
      <h1>${t.title}</h1>
      <p class="section-intro">benchmark는 scenario compare와 regression recover를 함께 보는 화면입니다. heavy evidence보다 비교 판단과 next action을 먼저 올립니다.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a></div>
  </div>
  ${input.flash}
  <div class="summary-grid">${input.summaryCards}</div>
</section>

${renderRailSection({
  title: "다음 안전 액션",
  intro: "backend matrix와 regression queue를 같은 compare grammar로 읽고, sources는 마지막에 내립니다.",
  cards: [
    {
      title: "backend matrix 읽기",
      intro: "상태보다 허용률, 실패율, 메모를 함께 읽어 현재 시나리오가 승격 가능한지 판단합니다.",
      tone: "muted",
      items: [
        { label: "상태", detail: "시나리오 결과가 usable 한지 먼저 확인합니다." },
        { label: "지연 + 허용률", detail: "비용과 품질을 한 줄에서 함께 읽습니다." },
        { label: "linked outputs", detail: "필요할 때만 smoke / plan artifacts로 내려갑니다." }
      ]
    },
    {
      title: "regression queue 읽기",
      intro: "warning과 error를 먼저 보고 drift와 issue를 그 다음에 해석합니다.",
      tone: "warn",
      items: [
        { label: "경고 / 오류", detail: "차단 여부를 가장 먼저 판단합니다." },
        { label: "렌더 드리프트", detail: "비교 기준을 벗어난 폭을 빠르게 읽습니다." },
        { label: "이슈 요약", detail: "세부 evidence를 열기 전에 다음 조치를 정합니다." }
      ]
    },
    {
      title: "linked compare flow",
      intro: "benchmark 결과는 rollout과 artifacts까지 연결될 때만 운영 판단이 됩니다.",
      tone: "ok",
      items: [
        { label: "rollouts로 인계", detail: "동일 번들의 rollout decision surface와 연결합니다." },
        { label: "artifacts로 확인", detail: "근거가 필요할 때만 linked outputs로 이동합니다." },
        { label: "sources는 마지막", detail: "raw source rows는 2차 evidence로 아래에 둡니다." }
      ],
      linksHtml: `<a href="/ui/rollouts">${t.openRollouts}</a><a href="/ui/artifacts">${t.openArtifacts}</a>`
    }
  ]
})}

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.backendTitle}</h2>
      <p class="section-intro">backend compare의 1차 표입니다. row별 next action을 먼저 읽고 필요할 때만 source evidence로 내려갑니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-backend-table" aria-label="백엔드 벤치마크 필터" placeholder="${t.backendFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>시나리오 / 다음 액션</th><th>상태</th><th>지연 시간</th><th>허용률</th><th>실패율</th><th>메모</th><th>소스</th></tr></thead><tbody>${
    input.backendRows || renderTableEmptyRow(7, t.noBackendRows)
  }</tbody></table></div>
</section>

<section class="card ops-table-shell">
  <div class="ops-table-meta">
    <div>
      <h2>${t.regressionTitle}</h2>
      <p class="section-intro">regression queue의 1차 표입니다. warning / error를 먼저 읽고 drift와 issue를 뒤에 붙입니다.</p>
    </div>
    <input type="search" data-table-filter="benchmark-regression-table" aria-label="회귀 리포트 필터" placeholder="${t.regressionFilterPlaceholder}"/>
  </div>
  <div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>번들 / 다음 액션</th><th>상태</th><th>경고 / 오류</th><th>프로필</th><th>렌더 드리프트</th><th>이슈</th><th>소스</th></tr></thead><tbody>${
    input.regressionRows || renderTableEmptyRow(7, t.noRegressionRows)
  }</tbody></table></div>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>2차 evidence / sources</h2>
      <p class="section-intro">${t.sourcesHint}</p>
    </div>
  </div>
  <div class="status-list">${input.sourceRows}</div>
</section>`;
}
