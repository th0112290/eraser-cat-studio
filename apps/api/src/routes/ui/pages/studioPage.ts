function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type StudioChannelProfileSummary = {
  source: string;
  channelName: string;
  channelId: string;
  language: string;
  tone: string;
  pacing: string;
  stylePresetCount: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
  updatedAt: string;
  editorHref: string;
};

type StudioPackStateSummary = {
  activePackId: string;
  activePackVersion: string;
  activePackStatus: string;
  latestPackId: string;
  latestPackCreatedAt: string;
  approvedCount: number;
  archivedCount: number;
  pendingCount: number;
  compareHref: string;
  charactersHref: string;
  generatorHref: string;
};

type StudioBodyInput = {
  message?: string;
  error?: string;
  styleOptions: string;
  speciesOptions: string;
  channelProfile: StudioChannelProfileSummary;
  packState: StudioPackStateSummary;
};

function renderMetaRow(label: string, value: string): string {
  return `<div class="studio-meta-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

type StudioLinkItem = {
  label: string;
  href: string;
};

type StudioFeedCardInput = {
  kicker: string;
  title: string;
  note: string;
  counterId: string;
  refreshId: string;
  filterId: string;
  filterLabel: string;
  filterPlaceholder: string;
  filterNote: string;
  tableId: string;
  tableHead: string;
  loadingColspan: number;
  loadingTitle: string;
  loadingDetail: string;
};

function renderStudioWorkbenchLink(label: string, note: string, href: string): string {
  return `<a href="${esc(href)}" class="studio-workbench-link"><strong>${esc(label)}</strong><span>${esc(note)}</span></a>`;
}

function renderStudioNextAction(step: string, label: string, title: string, copy: string, links: StudioLinkItem[]): string {
  return `<article class="studio-next-card"><div class="studio-kicker"><span class="studio-step">${esc(step)}</span><span>${esc(
    label
  )}</span></div><h3>${esc(title)}</h3><p class="studio-copy">${esc(copy)}</p><div class="studio-links">${links
    .map((link) => `<a href="${esc(link.href)}" class="studio-link">${esc(link.label)}</a>`)
    .join("")}</div></article>`;
}

function renderStudioFeedCard(input: StudioFeedCardInput): string {
  return `<section class="studio-section studio-feed-card"><div class="studio-head"><div class="studio-head-copy"><div class="studio-kicker">${esc(
    input.kicker
  )}</div><h2>${esc(input.title)}</h2><p class="studio-monitor-note">${esc(input.note)}</p></div><div class="studio-actions"><span id="${esc(
    input.counterId
  )}" class="studio-counter">대기 중</span><button type="button" id="${esc(
    input.refreshId
  )}" class="secondary">새로고침</button></div></div><div class="studio-table-tools"><input id="${esc(
    input.filterId
  )}" type="search" autocomplete="off" aria-label="${esc(input.filterLabel)}" placeholder="${esc(
    input.filterPlaceholder
  )}" /><span class="studio-filter-note">${esc(
    input.filterNote
  )}</span></div><div class="studio-table-wrap"><table id="${esc(
    input.tableId
  )}"><thead>${input.tableHead}</thead><tbody><tr><td colspan="${input.loadingColspan}"><div class="studio-state studio-state-loading"><strong>${esc(
    input.loadingTitle
  )}</strong><span>${esc(input.loadingDetail)}</span></div></td></tr></tbody></table></div></section>`;
}

export function buildStudioBody(input: StudioBodyInput): string {
  const seed = {
    activePackId: input.packState.activePackId,
    compareHref: input.packState.compareHref
  };
  const activePackSummary = input.packState.activePackId
    ? `${input.packState.activePackId} / v${input.packState.activePackVersion || "-"}`
    : "활성 팩 없음";
  const latestPackSummary = input.packState.latestPackId
    ? `${input.packState.latestPackId} @ ${input.packState.latestPackCreatedAt}`
    : "최근 팩 활동 없음";
  const packDriftHeadline =
    input.packState.latestPackId &&
    input.packState.activePackId &&
    input.packState.latestPackId !== input.packState.activePackId
      ? "최신 팩이 현재 활성 팩보다 더 새롭습니다."
      : "활성 팩이 최신 검토 출력과 일치합니다.";
  const reviewPressureHeadline =
    input.packState.pendingCount > 0
      ? `${input.packState.pendingCount}개의 팩 결정이 아직 대기 중입니다.`
      : "디스패치를 막는 미결 팩 승인이 없습니다.";
  const guardrailHeadline =
    input.channelProfile.forbiddenTermsSummary !== "(none)" || input.channelProfile.negativeTermsSummary !== "(none)"
      ? "이 채널에는 프롬프트 가드레일이 활성화되어 있습니다."
      : "현재 프롬프트 가드레일이 비교적 가볍습니다.";
  const workbenchLinks = [
    renderStudioWorkbenchLink("에셋", "새 입력과 reference readiness를 검토합니다.", "/ui/assets"),
    renderStudioWorkbenchLink("캐릭터 생성기", "생성 허브에서 compare, approve, regenerate, recreate를 운영합니다.", input.packState.generatorHref),
    renderStudioWorkbenchLink("캐릭터", "preview, QC, lineage, jobs를 읽는 깊은 수동 팩 리뷰를 엽니다.", input.packState.charactersHref),
    renderStudioWorkbenchLink("에피소드", "에디터와 에피소드 상세 워크벤치를 엽니다.", "/ui/episodes"),
    renderStudioWorkbenchLink("작업", "큐 실행을 보고 실패를 복구합니다.", "/ui/jobs"),
    renderStudioWorkbenchLink("프로필", "프롬프트 규칙과 채널 정책을 점검합니다.", "/ui/profiles")
  ].join("");
  return `<style>
    .studio-shell{display:grid;gap:14px;padding:18px;border:1px solid #d6e0ef;background:linear-gradient(180deg,#fbfdff,#f3f7fd);box-shadow:0 18px 46px rgba(15,23,42,.08)}
    .studio-hero{display:grid;gap:14px;grid-template-columns:minmax(0,1.2fr) minmax(280px,.9fr)}
    .studio-hero-card,.studio-runtime-card,.studio-signal,.studio-guide,.studio-section{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
    .studio-hero-card,.studio-runtime-card,.studio-signal,.studio-section{padding:18px}
    .studio-hero-card::before,.studio-section::before,.studio-signal::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.15))}
    .studio-runtime-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#be6727,rgba(190,103,39,.18))}
    .studio-guide{padding:0}
    .studio-guide summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;font-weight:700}
    .studio-guide summary::-webkit-details-marker{display:none}
    .studio-guide-body{padding:0 18px 18px;color:#5b6b82}
    .studio-guide-body ol{margin:0;padding-left:18px;display:grid;gap:8px}
    .studio-eyebrow,.studio-kicker{margin:0 0 8px;color:#1257c7;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-kicker{display:flex;align-items:center;gap:10px;color:#5b6b82}
    .studio-hero-card h1{margin:0;font-size:34px;line-height:1;letter-spacing:-.04em}
    .studio-hint,.studio-copy,.studio-monitor-note,.studio-guide-note{margin:10px 0 0;color:#5b6b82;font-size:14px;line-height:1.55}
    .studio-pill-row,.studio-actions,.studio-links,.studio-stage-meta{display:flex;gap:8px;flex-wrap:wrap}
    .studio-pill,.studio-counter,.studio-meta-chip,.studio-link{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #d6e0ef;background:#fff;font-size:12px;font-weight:700;white-space:nowrap}
    .studio-pill{background:#f5f8fe}
    .studio-counter{background:#ebf3ff;border-color:#c8d9fb;color:#1257c7}
    .studio-meta-chip{background:#f7f9fc;color:#395170}
    .studio-link{appearance:none;cursor:pointer;color:#142033;text-decoration:none}
    .studio-link:hover{text-decoration:none;box-shadow:0 8px 20px rgba(18,87,199,.08);border-color:#b8cde9}
    .studio-status{margin-top:14px;padding:14px 16px;border-radius:16px;border:1px solid #d9e5fb;background:linear-gradient(180deg,#f7faff,#edf4ff)}
    .studio-status-label{display:block;margin:0 0 8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    #studio-status{margin:0;padding:0;border:0;background:none;box-shadow:none;color:#142033;font-weight:600}
    .studio-runtime-card{display:grid;gap:14px;background:linear-gradient(180deg,#fffefd,#fff7f1)}
    .studio-runtime-controls{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
    .studio-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid #ecd5c3;background:rgba(255,255,255,.78);font-weight:600}
    .studio-grid{display:grid;gap:14px;grid-template-columns:minmax(380px,1.08fr) minmax(360px,.92fr) minmax(300px,.86fr);align-items:start}
    .studio-col{display:grid;gap:14px}
    .studio-ops-rail{display:grid;gap:14px;position:sticky;top:84px}
    .studio-ops-card{position:relative;overflow:hidden;padding:18px;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#f7fffc,#f4f8ff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
    .studio-ops-card::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#0f766e,rgba(15,118,110,.15))}
    .studio-ops-kicker{margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-meta{display:grid;gap:8px}
    .studio-meta-row{display:grid;gap:4px;padding:10px 12px;border:1px solid #d8e1ec;border-radius:14px;background:#fff}
    .studio-meta-row span{color:#5b6b82;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
     .studio-meta-row strong{font-size:13px;color:#142033}
     .studio-selection-empty{padding:12px;border:1px dashed #bfd4e8;border-radius:14px;background:#f8fbff;color:#5b6b82;font-size:13px}
     .studio-selection-grid{display:grid;gap:10px}
     .studio-selection-block{display:grid;gap:8px;padding:12px;border:1px solid #d8e1ec;border-radius:14px;background:#fff}
     .studio-selection-block>span{color:#5b6b82;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
     .studio-selection-copy{margin:0;color:#5b6b82;font-size:13px;line-height:1.55}
     .studio-selection-links{display:flex;gap:8px;flex-wrap:wrap}
     .studio-section{background:linear-gradient(180deg,#fff,#f9fbff)}
    .studio-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .studio-head-copy{max-width:58ch}
    .studio-step{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:10px;border:1px solid #c8d9fb;background:#ebf3ff;color:#1257c7;font-size:13px;font-weight:700}
    .studio-section h2{margin:0;font-size:22px;letter-spacing:-.03em}
    .studio-field-note{margin:12px 0 0;color:#5b6b82;font-size:12px;line-height:1.5}
    .studio-page-input,.studio-toolbar-input{}
    .studio-shell label,.studio-grid label,.studio-board label{display:grid;gap:6px;font-size:13px;font-weight:600;color:#142033}
    .studio-shell input:not([type="checkbox"]):not([type="file"]),.studio-shell select,.studio-shell textarea,.studio-grid input:not([type="checkbox"]):not([type="file"]),.studio-grid select,.studio-grid textarea,.studio-board input:not([type="checkbox"]):not([type="file"]),.studio-board select,.studio-board textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d4deec;border-radius:12px;background:#fff;color:#142033;transition:border-color .15s ease,box-shadow .15s ease}
    .studio-shell input[type="file"],.studio-grid input[type="file"],.studio-board input[type="file"]{padding:9px 10px;border:1px dashed #c1d2e7;border-radius:12px;background:#fff}
    .studio-shell input:not([type="checkbox"]):not([type="file"]):focus,.studio-shell select:focus,.studio-shell textarea:focus,.studio-grid input:not([type="checkbox"]):not([type="file"]):focus,.studio-grid select:focus,.studio-grid textarea:focus,.studio-board input:not([type="checkbox"]):not([type="file"]):focus,.studio-board select:focus,.studio-board textarea:focus{outline:none;border-color:#8eb1ef;box-shadow:0 0 0 3px rgba(18,87,199,.12)}
    .studio-shell textarea,.studio-grid textarea,.studio-board textarea{resize:vertical;min-height:88px}
    .studio-shell button,.studio-grid button,.studio-board button{appearance:none;padding:10px 14px;border-radius:12px;border:1px solid #c1d2e7;background:#fff;color:#142033;font-weight:700;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
    .studio-shell button:hover,.studio-grid button:hover,.studio-board button:hover{transform:translateY(-1px);border-color:#aac2e9;box-shadow:0 10px 24px rgba(15,23,42,.08)}
    .studio-shell button[data-primary-action="1"],.studio-grid button[data-primary-action="1"],.studio-board button[data-primary-action="1"]{border-color:#0f4aad;background:linear-gradient(180deg,#1660d0,#0f4fad);color:#fff;box-shadow:0 12px 24px rgba(18,87,199,.18)}
    .studio-shell button.secondary,.studio-grid button.secondary,.studio-board button.secondary{background:#f5f8fe}
    .studio-output{margin:14px 0 0;min-height:120px;padding:14px 16px;border:1px solid #233554;border-radius:16px;background:linear-gradient(180deg,#0f1726,#142033);color:#dfe9ff;overflow:auto;font-size:12px;line-height:1.55}
    .studio-binding-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px}
    .studio-binding{padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
    .studio-binding span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    .studio-action-cluster{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border:1px solid #d4deec;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
    .studio-cluster-label{margin-right:4px;color:#5b6b82;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .studio-table-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
    .studio-filter-note{color:#5b6b82;font-size:12px}
    .studio-table-wrap{overflow:auto;max-height:340px;border:1px solid #dce5f3;border-radius:16px;background:#fff}
    .studio-table-wrap table{margin:0;min-width:100%;border-collapse:separate;border-spacing:0}
    .studio-table-wrap thead th{position:sticky;top:0;background:#f6f9ff;z-index:1}
    .studio-table-wrap tbody tr:hover{background:#f8fbff}
    .studio-table-wrap tbody tr:focus-within{outline:2px solid #0f5bd8;outline-offset:-2px}
    .studio-table-wrap tbody tr[data-selected="true"]{background:#eef4ff;box-shadow:inset 3px 0 0 #1257c7}
    .studio-state{display:grid;gap:4px;padding:14px 16px;margin:4px 0;border-radius:14px;border:1px solid transparent;text-align:left}
    .studio-state strong{font-size:13px}
    .studio-state span{color:#5b6b82;font-size:12px;line-height:1.45}
    .studio-state-loading{border-color:#d9e5fb;background:linear-gradient(180deg,#f6f9ff,#edf4ff)}
    .studio-state-empty{border-color:#e3eaf4;background:linear-gradient(180deg,#fbfcfe,#f5f8fc)}
    .studio-state-error{border-color:#f0c6b7;background:linear-gradient(180deg,#fff8f5,#fff1ed)}
    .studio-state-error strong,.studio-state-error span{color:#8b3520}
    .studio-signal-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
    .studio-signal{display:grid;gap:8px;min-height:112px}
    .studio-signal-label{color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .studio-signal-value{font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.02em}
    .studio-signal-note{color:#5b6b82;font-size:13px;line-height:1.5}
    .studio-title-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .studio-workbench-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:16px}
    .studio-workbench-link{display:grid;gap:6px;padding:14px;border:1px solid #d6e0ef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);text-decoration:none;color:#142033}
    .studio-workbench-link strong{font-size:13px}
    .studio-workbench-link span{font-size:12px;line-height:1.5;color:#5b6b82}
    .studio-workbench-link:hover{text-decoration:none;box-shadow:0 12px 24px rgba(18,87,199,.08);border-color:#b8cde9}
    .studio-plan-list{display:grid;gap:10px}
    .studio-next-card{padding:14px;border:1px solid #ecd5c3;border-radius:16px;background:rgba(255,255,255,.82)}
    .studio-next-card h3{margin:0;font-size:18px;letter-spacing:-.02em}
    .studio-board{display:grid;gap:14px;grid-template-columns:minmax(0,1.28fr) minmax(320px,.92fr);align-items:start}
    .studio-main-col{display:grid;gap:14px}
    .studio-overview-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:14px}
    .studio-overview-card{padding:14px;border:1px solid #d4deec;border-radius:16px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
    .studio-overview-card span{display:block;margin-bottom:8px;color:#5b6b82;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
    .studio-overview-card strong{display:block;font-size:15px;line-height:1.4}
    .studio-overview-card p{margin:8px 0 0;color:#5b6b82;font-size:13px;line-height:1.5}
    .studio-risk-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
    .studio-risk-card{display:grid;gap:8px;min-height:132px;padding:16px;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff)}
    .studio-risk-card strong{font-size:18px;line-height:1.35;letter-spacing:-.02em}
    .studio-risk-card p{margin:0;color:#5b6b82;font-size:13px;line-height:1.55}
    .studio-risk-level{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid #d4deec;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;justify-self:start}
    .studio-risk-level.attn{background:#fff7e8;border-color:#ecd5c3;color:#8b4c1c}
    .studio-risk-level.watch{background:#eef4ff;border-color:#c8d9fb;color:#1257c7}
    .studio-risk-level.good{background:#effcf5;border-color:#b8e7c8;color:#0f6b45}
    .studio-activity-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
    .studio-feed-card{min-height:0}
    .studio-ops-summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;gap:10px;font-weight:700}
    .studio-ops-summary::-webkit-details-marker{display:none}
    .studio-ops-details{padding:0}
    .studio-ops-body{padding:0 18px 18px;display:grid;gap:12px}
    .studio-shell code,.studio-shell pre,.studio-shell input,.studio-shell select,.studio-shell textarea,.studio-grid code,.studio-grid pre,.studio-grid input,.studio-grid select,.studio-grid textarea,.studio-board code,.studio-board pre,.studio-board input,.studio-board select,.studio-board textarea{font-family:"IBM Plex Mono","Cascadia Code","SFMono-Regular",Consolas,monospace}
    @media (max-width:1240px){.studio-hero,.studio-grid,.studio-signal-grid,.studio-runtime-controls,.studio-binding-grid,.studio-board,.studio-activity-grid{grid-template-columns:1fr}.studio-ops-rail{position:static}}
    @media (max-width:720px){.studio-shell,.studio-hero-card,.studio-runtime-card,.studio-section,.studio-signal,.studio-risk-card{padding:16px}.studio-head{flex-direction:column}.studio-action-cluster{align-items:stretch}.studio-action-cluster button{width:100%}}
  </style>
${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}
<section class="card studio-shell">
  <div class="studio-hero">
    <section class="studio-hero-card">
      <p class="studio-eyebrow">빠른 디스패치 허브</p>
      <div class="studio-title-row">
        <div>
          <h1>스튜디오</h1>
          <p class="studio-hint">다음 결정을 담당하는 워크벤치로 들어가기 전에 현재 상태, 최근 오브젝트 활동, 위험 신호를 먼저 확인하세요. 스튜디오는 모든 제어를 붙잡아 두는 곳이 아니라, 빠른 흐름을 올바른 surface로 밀어주는 dispatch hub여야 합니다.</p>
        </div>
      </div>
      <div class="studio-pill-row">
        <span class="studio-pill">빠른 흐름만 유지</span>
        <span class="studio-pill">새 입력은 Assets</span>
        <span class="studio-pill">생성/승인은 Generator</span>
        <span class="studio-pill">깊은 팩 리뷰는 Characters</span>
      </div>
      <div class="studio-status">
        <span class="studio-status-label">운영자 상태</span>
        <div id="studio-status" role="status" aria-live="polite" aria-atomic="true">준비됨: 상태를 검토하고 다음 액션을 고른 뒤, 적절한 전용 워크벤치로 일을 넘기세요.</div>
      </div>
      <div class="studio-workbench-grid">${workbenchLinks}</div>
    </section>
    <section class="studio-runtime-card">
      <div>
        <p class="studio-eyebrow" style="color:#be6727">상위 3개 디스패치</p>
        <h2 style="margin:0">한 화면에 오래 머무르지 않고 다음 surface로 보내기</h2>
        <p class="studio-copy">아래 액션들은 운영자를 한 번에 하나의 판단면으로 좁혀 줍니다. 깊은 비교나 팩 검수는 허브 밖으로 보냅니다.</p>
      </div>
      <div class="studio-plan-list">
        ${renderStudioNextAction("1", "검토", "새 입력은 Assets에서 닫기", "검토 워크벤치를 사용해 QC, 프리뷰 출력, 그리고 소스가 다운스트림 작업의 기준점이 될 준비가 되었는지 확인합니다.", [
          { label: "에셋 열기", href: "/ui/assets" },
          { label: "스튜디오 입력 열기", href: "#studio-intake" }
        ])}
        ${renderStudioNextAction("2", "스테이지", "생성은 Generator, 깊은 리뷰는 Characters", "새 런과 compare/approve/recover는 캐릭터 생성기로, preview/QC/lineage/jobs를 오래 읽는 검수는 캐릭터 화면으로 이동합니다.", [
          { label: "캐릭터 생성기 열기", href: input.packState.generatorHref },
          { label: "캐릭터 열기", href: input.packState.charactersHref },
          ...(input.packState.compareHref ? [{ label: "비교 열기", href: input.packState.compareHref }] : [])
        ])}
        ${renderStudioNextAction("3", "디스패치", "선택한 팩을 묶고 에피소드만 전진", "예전 올인원 대시보드를 다시 열지 않고 생성, 프리뷰, 편집, 퍼블리시로 이어가려면 디스패치 레일만 사용하세요.", [
          { label: "디스패치 레일 열기", href: "#studio-dispatch" },
          { label: "에피소드 열기", href: "/ui/episodes" },
          { label: "작업 열기", href: "/ui/jobs" }
        ])}
      </div>
    </section>
  </div>
</section>
<section class="studio-board">
  <div class="studio-main-col">
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">현재 상태 요약</div>
          <h2>운영 상태를 먼저 읽기</h2>
          <p class="studio-monitor-note">디스패치하거나 다음 워크벤치를 열기 전에 선택 상태, 활성 팩, 채널 정책을 여기서 계속 확인할 수 있습니다.</p>
        </div>
      </div>
      <div class="studio-signal-grid">
        <section class="studio-signal">
          <span class="studio-signal-label">선택된 팩</span>
          <strong id="studio-signal-pack" class="studio-signal-value">선택된 팩 없음</strong>
          <span class="studio-signal-note">최근 오브젝트 활동에서 팩을 골라 안전하게 디스패치에 바인딩하세요.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">에피소드 대상</span>
          <strong id="studio-signal-episode" class="studio-signal-value">선택된 에피소드 없음</strong>
          <span id="studio-signal-topic" class="studio-signal-note">주제가 아직 설정되지 않았습니다.</span>
        </section>
        <section class="studio-signal">
          <span class="studio-signal-label">운영 모델</span>
          <strong class="studio-signal-value">빠른 흐름 -> 전용 surface</strong>
          <span class="studio-signal-note">빠른 흐름은 Studio, 깊은 생성/검수는 Generator와 Characters를 사용하세요.</span>
        </section>
      </div>
      <div class="studio-overview-grid">
        <article class="studio-overview-card"><span>채널</span><strong>${esc(input.channelProfile.channelName)}</strong><p>${esc(input.channelProfile.channelId || "(기본값)")} / ${esc(input.channelProfile.language)}</p></article>
        <article class="studio-overview-card"><span>활성 팩</span><strong>${esc(activePackSummary)}</strong><p>${esc(input.packState.activePackStatus || "기록된 팩 상태 없음")}</p></article>
        <article class="studio-overview-card"><span>최신 팩 활동</span><strong>${esc(latestPackSummary)}</strong><p>승인 ${esc(String(input.packState.approvedCount))} / 보관 ${esc(String(input.packState.archivedCount))}</p></article>
        <article class="studio-overview-card"><span>프로필 갱신 시각</span><strong>${esc(input.channelProfile.updatedAt)}</strong><p>${esc(input.channelProfile.tone)} / ${esc(input.channelProfile.pacing)}</p></article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">위험 신호</div>
          <h2>움직이기 전에 마찰을 훑기</h2>
          <p class="studio-monitor-note">이 신호들은 모든 제어를 열어두지 않아도 비교, 검토, 복구 이슈를 계속 보이게 유지합니다.</p>
        </div>
      </div>
      <div class="studio-risk-grid">
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.latestPackId && input.packState.activePackId && input.packState.latestPackId !== input.packState.activePackId ? "attn" : "good"}">팩 드리프트</span>
          <strong>${esc(packDriftHeadline)}</strong>
          <p>활성 팩: ${esc(activePackSummary)}. 최신 활동: ${esc(latestPackSummary)}.</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${input.packState.pendingCount > 0 ? "watch" : "good"}">검토 압력</span>
          <strong>${esc(reviewPressureHeadline)}</strong>
          <p>팩 수: 승인 ${esc(String(input.packState.approvedCount))} / 보관 ${esc(String(input.packState.archivedCount))} / 대기 ${esc(String(input.packState.pendingCount))}.</p>
        </article>
        <article class="studio-risk-card">
          <span class="studio-risk-level ${guardrailHeadline.includes("활성") ? "attn" : "good"}">가드레일</span>
          <strong>${esc(guardrailHeadline)}</strong>
          <p>금지어: ${esc(input.channelProfile.forbiddenTermsSummary)}. 네거티브 용어: ${esc(input.channelProfile.negativeTermsSummary)}.</p>
        </article>
      </div>
    </section>
    <section class="studio-section">
      <div class="studio-head">
        <div class="studio-head-copy">
          <div class="studio-kicker">최근 오브젝트 활동</div>
          <h2>라이브 피드 검토</h2>
          <p class="studio-monitor-note">이 압축된 피드를 사용해 지금 관심이 필요한 오브젝트를 고른 뒤, 맞는 워크벤치나 디스패치 레일에서 계속 진행하세요. 허브는 선택과 라우팅만 담당합니다.</p>
        </div>
        <div class="studio-links"><a href="#studio-live-controls" class="studio-link">라이브 제어 열기</a></div>
      </div>
      <div class="studio-activity-grid">
        ${renderStudioFeedCard({
          kicker: "에셋",
          title: "최근 에셋",
          note: "다음 판단이 QC 또는 프리뷰 검증이라면 에셋 검토로 바로 이동하세요.",
          counterId: "studio-assets-count",
          refreshId: "studio-refresh-assets",
          filterId: "studio-filter-assets",
          filterLabel: "최근 에셋 필터",
          filterPlaceholder: "에셋 검색 (id/타입/상태)",
          filterNote: "현재 페이지 필터",
          tableId: "studio-assets-table",
          tableHead: "<tr><th>ID</th><th>타입</th><th>상태</th><th>생성 시각</th></tr>",
          loadingColspan: 4,
          loadingTitle: "에셋 불러오는 중",
          loadingDetail: "최신 에셋 입력 레코드를 가져오는 중입니다."
        })}
        ${renderStudioFeedCard({
          kicker: "팩",
          title: "생성된 캐릭터 팩",
          note: "행을 클릭해 디스패치 레일에 바인딩하거나 팩 검토를 엽니다.",
          counterId: "studio-packs-count",
          refreshId: "studio-refresh-packs",
          filterId: "studio-filter-packs",
          filterLabel: "생성된 캐릭터 팩 필터",
          filterPlaceholder: "팩 검색 (id/상태/에피소드)",
          filterNote: "행 클릭으로 팩 선택",
          tableId: "studio-packs-table",
          tableHead: "<tr><th>ID</th><th>버전</th><th>상태</th><th>에피소드</th></tr>",
          loadingColspan: 4,
          loadingTitle: "캐릭터 팩 불러오는 중",
          loadingDetail: "최신 생성 출력을 가져오는 중입니다."
        })}
        ${renderStudioFeedCard({
          kicker: "에피소드",
          title: "최근 에피소드",
          note: "행을 클릭하면 디스패치 레일에 episode id와 주제를 미리 채웁니다.",
          counterId: "studio-episodes-count",
          refreshId: "studio-refresh-episodes",
          filterId: "studio-filter-episodes",
          filterLabel: "최근 에피소드 필터",
          filterPlaceholder: "에피소드 검색 (id/주제/상태)",
          filterNote: "행 클릭으로 에피소드 선택",
          tableId: "studio-episodes-table",
          tableHead: "<tr><th>ID</th><th>주제</th><th>상태</th><th>최신 작업</th></tr>",
          loadingColspan: 4,
          loadingTitle: "에피소드 불러오는 중",
          loadingDetail: "최신 에피소드 큐 상태를 동기화하는 중입니다."
        })}
        ${renderStudioFeedCard({
          kicker: "작업",
          title: "최근 작업",
          note: "허브를 벗어나지 않고 프리뷰, 렌더, 퍼블리시 실행을 확인합니다.",
          counterId: "studio-jobs-count",
          refreshId: "studio-refresh-jobs",
          filterId: "studio-filter-jobs",
          filterLabel: "최근 작업 필터",
          filterPlaceholder: "작업 검색 (id/타입/상태/에피소드)",
          filterNote: "최신 행만 표시",
          tableId: "studio-jobs-table",
          tableHead: "<tr><th>작업</th><th>타입</th><th>상태</th><th>진행률</th><th>에피소드</th></tr>",
          loadingColspan: 5,
          loadingTitle: "작업 불러오는 중",
          loadingDetail: "최신 큐 텔레메트리를 기다리는 중입니다."
        })}
      </div>
    </section>
  </div>
  <aside class="studio-ops-rail">
    <section class="studio-ops-card">
      <p class="studio-ops-kicker">선택된 오브젝트</p>
      <h2 id="studio-selection-title" style="margin:0">오브젝트를 고르세요</h2>
      <p id="studio-selection-meta" class="studio-monitor-note">최근 오브젝트 활동에서 팩이나 에피소드를 고르면 object summary, next safe action, linked routes, evidence가 여기에 고정됩니다.</p>
      <div id="studio-selection-fields" class="studio-selection-grid"><div class="studio-selection-empty">아직 고정된 오브젝트가 없습니다.</div></div>
      <div id="studio-selection-links" class="studio-links" style="margin-top:12px"></div>
      <div class="studio-selection-grid" style="margin-top:12px">
        <section class="studio-selection-block">
          <span>Creation Handoff</span>
          <p id="studio-nav-current" class="studio-selection-copy">현재 object deep link가 아직 없습니다.</p>
          <div id="studio-nav-actions" class="studio-selection-links"></div>
        </section>
        <section class="studio-selection-block">
          <span>Pinned Reopen</span>
          <div id="studio-nav-pins" class="studio-selection-links"></div>
        </section>
        <section class="studio-selection-block">
          <span>Recent Reopen</span>
          <div id="studio-nav-recents" class="studio-selection-links"></div>
        </section>
      </div>
    </section>
    <section class="studio-ops-card" id="studio-dispatch">
      <p class="studio-ops-kicker">디스패치 레일</p>
      <h2 style="margin:0">팩을 바인딩하고 에피소드를 전진</h2>
      <p class="studio-monitor-note">위 오브젝트 요약에서 다음 surface를 확인한 뒤, 이 레일에서는 fast flow binding만 수행하세요. 승인, 비교, 롤백 판단은 Generator/Characters에 남깁니다.</p>
      <div class="studio-links"><a href="/ui/character-generator" class="studio-link" id="studio-dispatch-generator">Generator로 가기</a><a href="/ui/characters" class="studio-link" id="studio-dispatch-characters">Characters로 가기</a></div>
      <div class="studio-binding-grid">
        <label class="studio-binding"><span>에피소드 주제</span><input id="studio-topic" placeholder="예: 캐릭터 소개 영상"/></label>
        <label class="studio-binding"><span>episodeId</span><input id="studio-episode-id" placeholder="cmm..."/></label>
        <label class="studio-binding"><span>선택된 캐릭터 팩</span><input id="studio-selected-pack" placeholder="활동 피드에서 선택" readonly/></label>
      </div>
      <div style="display:grid;gap:12px;margin-top:16px">
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">파이프라인</span>
          <button type="button" id="studio-oneclick" data-primary-action="1" data-primary-label="원클릭 프리뷰 흐름 시작">원클릭 시작 (생성 + 프리뷰)</button>
          <button type="button" id="studio-create-episode" class="secondary">에피소드만 생성</button>
        </div>
        <div class="studio-action-cluster">
          <span class="studio-cluster-label">에피소드 작업</span>
          <button type="button" id="studio-open-editor" class="secondary">에디터 열기</button>
          <button type="button" id="studio-enqueue-preview" class="secondary">프리뷰 렌더 큐 등록</button>
          <button type="button" id="studio-open-publish" class="secondary">퍼블리시 인계 열기</button>
        </div>
      </div>
    </section>
    <details class="studio-ops-card studio-ops-details" id="studio-intake">
      <summary class="studio-ops-summary"><span>빠른 입력</span><span class="studio-guide-note">기본 접힘 상태</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">에셋 검토 워크벤치로 빠르게 넘길 때만 사용하세요.</p>
        <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
          <div class="grid two">
            <label>에셋 타입<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (뷰 변형)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트)</option></select></label>
            <label>파일<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
          </div>
          <div class="studio-actions">
            <button id="studio-asset-upload-submit" type="submit">업로드</button>
            <a href="/ui/assets" class="studio-link">에셋 열기</a>
          </div>
        </form>
        <p class="studio-field-note">업로드에 성공하면 해당 에셋 점검 화면이 자동으로 열립니다.</p>
        <pre id="studio-asset-upload-result" class="studio-output" role="status" aria-live="polite" aria-atomic="true">대기 중</pre>
      </div>
    </details>
    <details class="studio-ops-card studio-ops-details" id="studio-live-controls">
      <summary class="studio-ops-summary"><span>라이브 피드 제어</span><span class="studio-guide-note">자동 새로고침 및 수동 동기화</span></summary>
      <div class="studio-ops-body">
        <p class="studio-monitor-note" style="margin-top:0">활동을 검토하는 동안 모니터 레일을 계속 최신 상태로 유지하세요. 깨끗한 동기화 지점이 필요하면 수동 새로고침을 사용하면 됩니다.</p>
        <div class="studio-runtime-controls">
          <label class="studio-toggle"><span>자동 새로고침</span><input id="studio-auto-refresh" type="checkbox" checked/></label>
          <label>간격
            <select id="studio-refresh-interval">
              <option value="3000">3s</option>
              <option value="5000" selected>5s</option>
              <option value="10000">10s</option>
            </select>
          </label>
        </div>
        <div class="studio-actions">
          <button type="button" id="studio-refresh-all" class="secondary">모든 피드 새로고침</button>
        </div>
        <div class="studio-links">
          <a href="/ui/jobs" class="studio-link">작업</a>
          <a href="/ui/episodes" class="studio-link">에피소드</a>
          <a href="/ui/rollouts" class="studio-link">롤아웃</a>
        </div>
      </div>
    </details>
    <section class="studio-ops-card">
      <p class="studio-ops-kicker">채널 프로필</p>
      <h2 style="margin:0">${esc(input.channelProfile.channelName)}</h2>
      <p class="studio-monitor-note">생성이나 에피소드 프리뷰 작업을 큐에 넣기 전에 활성 채널 프로필을 검증하세요.</p>
      <div class="studio-meta">
        ${renderMetaRow("소스", input.channelProfile.source)}
        ${renderMetaRow("채널", `${input.channelProfile.channelId || "(기본값)"} / ${input.channelProfile.language}`)}
        ${renderMetaRow("톤 & 페이싱", `${input.channelProfile.tone} / ${input.channelProfile.pacing}`)}
        ${renderMetaRow("스타일 프리셋 수", String(input.channelProfile.stylePresetCount))}
        ${renderMetaRow("금지어", input.channelProfile.forbiddenTermsSummary)}
        ${renderMetaRow("네거티브 용어", input.channelProfile.negativeTermsSummary)}
        ${renderMetaRow("업데이트 시각", input.channelProfile.updatedAt)}
      </div>
      <div class="studio-links" style="margin-top:12px">
        <a href="${esc(input.channelProfile.editorHref)}" class="studio-link">채널 바이블 열기</a>
        <a href="/ui/profiles" class="studio-link">프로필 열기</a>
        <a href="/ui/rollouts" class="studio-link">롤아웃 열기</a>
      </div>
    </section>
  </aside>
</section>
<script>
(() => {
  const q = (id) => document.getElementById(id);
  const assetsBody = q("studio-assets-table")?.querySelector("tbody");
  const packsBody = q("studio-packs-table")?.querySelector("tbody");
  const episodesBody = q("studio-episodes-table")?.querySelector("tbody");
  const jobsBody = q("studio-jobs-table")?.querySelector("tbody");
  const statusBox = q("studio-status");
  const selectedPack = q("studio-selected-pack");
  const episodeInput = q("studio-episode-id");
  const topicInput = q("studio-topic");
  const autoRefreshInput = q("studio-auto-refresh");
  const refreshIntervalInput = q("studio-refresh-interval");
  const selectionTitle = q("studio-selection-title");
  const selectionMeta = q("studio-selection-meta");
  const selectionFields = q("studio-selection-fields");
  const selectionLinks = q("studio-selection-links");
  const navCurrent = q("studio-nav-current");
  const navActions = q("studio-nav-actions");
  const navPins = q("studio-nav-pins");
  const navRecents = q("studio-nav-recents");
  const dispatchGeneratorLink = q("studio-dispatch-generator");
  const dispatchCharactersLink = q("studio-dispatch-characters");
  const compareHref = ${JSON.stringify(seed.compareHref)};
  const activePackId = ${JSON.stringify(seed.activePackId)};
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "";
  const initialPackId = params.get("packId") || "";
  const initialEpisodeId = params.get("episodeId") || "";
  let selectedAssetId = params.get("assetId") || "";
  let selectionObject =
    params.get("currentObject") ||
    (selectedAssetId
      ? "asset:" + selectedAssetId
      : initialPackId
        ? "pack:" + initialPackId
        : initialEpisodeId
          ? "episode:" + initialEpisodeId
          : activePackId
            ? "pack:" + activePackId
            : "");
  const focusTargetId = params.get("focus") || "studio-selection";
  let refreshTimer = null;

  const creationNs = "ecs.ui.creation.nav.v1";
  const safe = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;").replaceAll("'", "&#39;");
  const renderStateRow = (colspan, tone, title, detail) => "<tr><td colspan='" + colspan + "'><div class='studio-state studio-state-" + tone + "'><strong>" + safe(title) + "</strong><span>" + safe(detail) + "</span></div></td></tr>";
  const readText = (v, fallback = "-") => {
    const text = String(v ?? "").trim();
    return text ? text : fallback;
  };
  const readPath = (root, path) => {
    let current = root;
    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) return null;
      current = current[key];
    }
    return current;
  };
  const parseJson = (value, fallback) => {
    try {
      const parsed = JSON.parse(String(value || ""));
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  };
  const readList = (kind) => {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const parsed = parseJson(window.localStorage.getItem(creationNs + ".recent." + kind), []);
    return Array.isArray(parsed) ? parsed : [];
  };
  const writeList = (kind, items) => {
    try {
      window.localStorage.setItem(creationNs + ".recent." + kind, JSON.stringify(items.slice(0, 6)));
    } catch {}
  };
  const readPin = (kind) => {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const parsed = parseJson(window.localStorage.getItem(creationNs + ".pin." + kind), null);
    return parsed && typeof parsed === "object" ? parsed : null;
  };
  const writePin = (kind, item) => {
    try {
      window.localStorage.setItem(creationNs + ".pin." + kind, JSON.stringify(item));
    } catch {}
  };
  const pushRecent = (kind, item) => {
    if (!item || !item.id) return;
    const next = [item].concat(readList(kind).filter((entry) => entry && entry.id !== item.id));
    writeList(kind, next);
  };
  const buildHref = (pathname, entries) => {
    const url = new URL(pathname, window.location.origin);
    Object.entries(entries || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.pathname + url.search;
  };
  const currentPackId = () => (selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
  const currentEpisodeId = () => (episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
  const currentStudioObject = () =>
    selectionObject ||
    (selectedAssetId
      ? "asset:" + selectedAssetId
      : currentPackId()
        ? "pack:" + currentPackId()
        : currentEpisodeId()
          ? "episode:" + currentEpisodeId()
          : "");
  const buildStudioHref = (extra = {}) =>
    buildHref("/ui/studio", {
      assetId: selectedAssetId || undefined,
      packId: currentPackId() || undefined,
      episodeId: currentEpisodeId() || undefined,
      returnTo: returnTo || undefined,
      currentObject: currentStudioObject() || undefined,
      focus: "studio-selection",
      ...extra
    });
  const buildAssetHref = (assetId, extra = {}) =>
    buildHref("/ui/assets", {
      assetId,
      returnTo: buildStudioHref({ assetId, currentObject: "asset:" + assetId }),
      currentObject: "asset:" + assetId,
      focus: "asset-selected-detail",
      ...extra
    });
  const buildGeneratorHref = (extra = {}) =>
    buildHref("/ui/character-generator", {
      referenceAssetId: selectedAssetId || undefined,
      assetId: selectedAssetId || undefined,
      returnTo: buildStudioHref(),
      currentObject: currentStudioObject() || undefined,
      focus: "cg-stage-context",
      ...extra
    });
  const buildCharactersHref = (packId, extra = {}) =>
    buildHref("/ui/characters", {
      characterPackId: packId || undefined,
      returnTo: buildStudioHref(packId ? { packId, currentObject: "pack:" + packId } : {}),
      currentObject: packId ? "pack:" + packId : currentStudioObject() || undefined,
      focus: "pack-review-current",
      ...extra
    });
  const buildCompareSurfaceHref = (packId) =>
    packId && activePackId && packId !== activePackId
      ? buildHref("/ui/character-generator/compare", {
          leftPackId: packId,
          rightPackId: activePackId,
          returnTo: buildStudioHref({ packId, currentObject: "pack:" + packId }),
          currentObject: "pack:" + packId,
          focus: "pack-compare-hero"
        })
      : compareHref;
  const renderNavLinks = (root, items, empty) => {
    if (!(root instanceof HTMLElement)) return;
    const valid = Array.isArray(items) ? items.filter((entry) => entry && entry.href && entry.label) : [];
    root.innerHTML = valid.length
      ? valid.map((entry) => "<a href=\\"" + safe(entry.href) + "\\" class=\\"studio-link\\">" + safe(entry.label) + "</a>").join("")
      : "<span class=\\"studio-monitor-note\\">" + safe(empty) + "</span>";
  };
  const syncStudioUrl = () => {
    const nextHref = buildStudioHref();
    if (window.location.pathname + window.location.search !== nextHref) {
      window.history.replaceState(null, "", nextHref);
    }
  };
  const pinCurrentSelection = () => {
    if (selectionObject.startsWith("asset:") && selectedAssetId) {
      writePin("asset", { id: selectedAssetId, label: "Asset " + selectedAssetId, href: buildAssetHref(selectedAssetId) });
      return;
    }
    const packId = currentPackId();
    if (selectionObject.startsWith("pack:") && packId) {
      writePin("pack", { id: packId, label: "Pack " + packId, href: buildCharactersHref(packId) });
    }
  };
  const renderCreationNav = () => {
    const packId = currentPackId();
    const currentLabel =
      selectionObject.startsWith("asset:") && selectedAssetId
        ? "Asset " + selectedAssetId
        : selectionObject.startsWith("pack:") && packId
          ? "Character Pack " + packId
          : selectionObject.startsWith("episode:") && currentEpisodeId()
            ? "Episode " + currentEpisodeId()
            : currentStudioObject() || "현재 creation object가 없습니다.";
    if (navCurrent instanceof HTMLElement) navCurrent.textContent = currentLabel;
    if (dispatchGeneratorLink instanceof HTMLAnchorElement) dispatchGeneratorLink.href = buildGeneratorHref();
    if (dispatchCharactersLink instanceof HTMLAnchorElement) dispatchCharactersLink.href = buildCharactersHref(packId);
    if (navActions instanceof HTMLElement) {
      const actions = [];
      if (selectedAssetId) actions.push({ href: buildAssetHref(selectedAssetId), label: "Asset detail" });
      if (packId) actions.push({ href: buildCharactersHref(packId), label: "Characters" });
      actions.push({ href: buildGeneratorHref(), label: "Generator" });
      if (packId && buildCompareSurfaceHref(packId)) actions.push({ href: buildCompareSurfaceHref(packId), label: "Compare" });
      if (returnTo) actions.push({ href: returnTo, label: "Return" });
      navActions.innerHTML =
        actions.map((entry) => "<a href=\\"" + safe(entry.href) + "\\" class=\\"studio-link\\">" + safe(entry.label) + "</a>").join("") +
        '<button type="button" id="studio-copy-link" class="studio-link">Copy Deep Link</button>' +
        ((selectionObject.startsWith("asset:") && selectedAssetId) || (selectionObject.startsWith("pack:") && packId)
          ? '<button type="button" id="studio-pin-current" class="studio-link">Pin Current</button>'
          : "");
      document.getElementById("studio-copy-link")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
        } catch {}
      });
      document.getElementById("studio-pin-current")?.addEventListener("click", () => {
        pinCurrentSelection();
        renderCreationNav();
      });
    }
    renderNavLinks(navPins, [readPin("asset"), readPin("pack"), readPin("run")].filter(Boolean), "Pinned reopen이 아직 없습니다.");
    renderNavLinks(
      navRecents,
      readList("assets").slice(0, 2).concat(readList("packs").slice(0, 2)).concat(readList("runs").slice(0, 2)),
      "최근 creation reopen 링크가 아직 없습니다."
    );
  };
  const rememberSelection = (kind, id) => {
    if (!id) return;
    if (kind === "asset") {
      pushRecent("assets", { id, label: "Asset " + id, href: buildAssetHref(id) });
      selectedAssetId = id;
      selectionObject = "asset:" + id;
    }
    if (kind === "pack") {
      pushRecent("packs", { id, label: "Pack " + id, href: buildCharactersHref(id) });
      selectionObject = "pack:" + id;
    }
    if (kind === "episode") {
      selectionObject = "episode:" + id;
    }
    syncStudioUrl();
    renderCreationNav();
  };
  const setStatus = (text) => { if (statusBox instanceof HTMLElement) statusBox.textContent = text; };
  const setCounter = (id, count) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = String(count) + "개 로드됨";
  };
  const setSignal = (id, value, fallback) => {
    const el = q(id);
    if (el instanceof HTMLElement) el.textContent = value && value.trim() ? value.trim() : fallback;
  };
  const updateSelectionSummary = () => {
    setSignal("studio-signal-pack", selectedPack instanceof HTMLInputElement ? selectedPack.value : "", "선택된 팩 없음");
    setSignal("studio-signal-episode", episodeInput instanceof HTMLInputElement ? episodeInput.value : "", "선택된 에피소드 없음");
    setSignal("studio-signal-topic", topicInput instanceof HTMLInputElement ? topicInput.value : "", "주제가 아직 설정되지 않았습니다.");
  };
  const markSelectedRows = (tbodyEl, kind, value) => {
    if (!(tbodyEl instanceof HTMLElement)) return;
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const rowValue =
        kind === "asset"
          ? row.dataset.assetId || ""
          : kind === "pack"
            ? row.dataset.packId || ""
            : row.dataset.episodeId || "";
      row.dataset.selected = value && rowValue === value ? "true" : "false";
    });
  };
  const applyFilter = (inputEl, tbodyEl) => {
    if (!(inputEl instanceof HTMLInputElement) || !(tbodyEl instanceof HTMLElement)) return;
    const qText = inputEl.value.trim().toLowerCase();
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const text = String(row.textContent || "").toLowerCase();
      row.style.display = !qText || text.includes(qText) ? "" : "";
      if (qText && !text.includes(qText)) row.style.display = "none";
    });
  };
  const readError = async (res, fallback) => {
    try {
      const json = await res.json();
      if (json && typeof json.error === "string" && json.error.trim()) return json.error.trim();
      return fallback;
    } catch {
      return fallback;
    }
  };
  const renderSelection = (title, metaText, summaryFields, nextAction, routeLinks, evidenceLinks = []) => {
    if (selectionTitle instanceof HTMLElement) selectionTitle.textContent = title;
    if (selectionMeta instanceof HTMLElement) selectionMeta.textContent = metaText;
    if (selectionFields instanceof HTMLElement) {
      const summaryHtml = Array.isArray(summaryFields) && summaryFields.length
        ? summaryFields.map((field) => "<div class=\\"studio-meta-row\\"><span>" + safe(field.label) + "</span><strong>" + safe(field.value) + "</strong></div>").join("")
        : "<div class=\\"studio-selection-empty\\">세부 요약을 준비하는 중입니다.</div>";
      const nextActionHtml =
        nextAction && (nextAction.title || nextAction.detail)
          ? "<section class=\\"studio-selection-block\\"><span>Next Safe Action</span><strong>" + safe(nextAction.title || "-") + "</strong><p class=\\"studio-selection-copy\\">" + safe(nextAction.detail || "-") + "</p></section>"
          : "";
      const evidenceHtml =
        Array.isArray(evidenceLinks) && evidenceLinks.length
          ? "<section class=\\"studio-selection-block\\"><span>Evidence</span><div class=\\"studio-selection-links\\">" + evidenceLinks.map((link) => "<a href=\\"" + safe(link.href) + "\\" class=\\"studio-link\\">" + safe(link.label) + "</a>").join("") + "</div></section>"
          : "";
      selectionFields.innerHTML = "<section class=\\"studio-selection-block\\"><span>Object Summary</span>" + summaryHtml + "</section>" + nextActionHtml + evidenceHtml;
    }
    if (selectionLinks instanceof HTMLElement) {
      const linkedRoutes = Array.isArray(routeLinks)
        ? routeLinks.map((link) => "<a href=\\"" + safe(link.href) + "\\" class=\\"studio-link\\">" + safe(link.label) + "</a>").join("")
        : "";
      selectionLinks.innerHTML = linkedRoutes ? "<span class=\\"studio-cluster-label\\">Linked Routes</span>" + linkedRoutes : "";
    }
  };
  const loadAssetInspector = async (assetId) => {
    if (!assetId) return;
    renderSelection("Asset loading...", "Studio inspector가 asset object를 읽는 중입니다.", [], null, [], []);
    try {
      const res = await fetch("/api/assets/" + encodeURIComponent(assetId));
      if (!res.ok) throw new Error("Asset detail lookup failed: " + res.status);
      const json = await res.json();
      const asset = json?.data;
      if (!asset) throw new Error("Asset detail payload is empty.");
      const ready = String(asset.status || "").toUpperCase() === "READY";
      renderSelection(
        "Asset " + readText(asset.id),
        "Studio는 dispatch hub로만 동작합니다. 깊은 QC와 asset evidence 확인은 Assets에서 이어집니다.",
        [
          { label: "Type", value: readText(asset.assetType || asset.type) },
          { label: "Status", value: readText(asset.status) },
          { label: "Channel", value: readText(asset.channelId) },
          { label: "Mime", value: readText(asset.mime) },
          { label: "Size", value: readText(asset.sizeBytes, "-") },
          { label: "Created", value: readText(asset.createdAt) }
        ],
        {
          title: ready ? "Character Generator로 handoff" : "Assets surface에서 readiness 확인",
          detail: ready
            ? "reference asset가 준비되었습니다. Generator에서 run object를 열고 compare/approve flow로 이동합니다."
            : "asset이 READY가 아니면 Studio에서는 dispatch만 유지하고, Assets에서 상태와 evidence를 먼저 확인합니다."
        },
        [
          { label: "Assets detail", href: buildAssetHref(assetId) },
          { label: "Character Generator", href: buildGeneratorHref({ referenceAssetId: assetId, assetId, currentObject: "asset:" + assetId }) },
          { label: "Studio dispatch", href: buildStudioHref({ assetId, currentObject: "asset:" + assetId }) }
        ],
        [{ label: "API JSON", href: "/api/assets/" + encodeURIComponent(assetId) }]
      );
      markSelectedRows(assetsBody, "asset", assetId);
      rememberSelection("asset", assetId);
    } catch (error) {
      renderSelection("Asset lookup failed", String(error), [], null, [{ label: "Assets", href: "/ui/assets" }], []);
    }
  };
  const summarizePackJson = (packJson) => {
    const selectedByView = readPath(packJson, ["selectedByView"]);
    const selectedViews = selectedByView && typeof selectedByView === "object" ? Object.keys(selectedByView).filter((key) => selectedByView[key]) : [];
    return {
      mascotProfile: readText(readPath(packJson, ["mascot", "profile"]) || readPath(packJson, ["profile"]) || readPath(packJson, ["profileAssetId"]), "(기록 없음)"),
      lineage: readText(readPath(packJson, ["sourceImageRef"]) || readPath(packJson, ["hash"]) || readPath(packJson, ["schemaId"]), "(기록 없음)"),
      selectedViews: selectedViews.length ? selectedViews.join(", ") : "(기록 없음)"
    };
  };
  const loadPackInspector = async (packId) => {
    if (!packId) return;
    renderSelection("팩 불러오는 중...", "API에서 팩 메타데이터를 읽는 중입니다...", [], null, [], []);
    try {
      const res = await fetch("/api/character-packs/" + encodeURIComponent(packId));
      if (!res.ok) throw new Error("팩 상세 조회 실패: " + res.status);
      const json = await res.json();
      const pack = json?.data;
      if (!pack) throw new Error("팩 상세 응답에 데이터가 없습니다.");
      const summary = summarizePackJson(pack.json);
      const latestEpisode = Array.isArray(pack.episodes) && pack.episodes.length > 0 ? pack.episodes[0] : null;
      const rollbackState = String(pack.status || "").toUpperCase() === "APPROVED" ? "활성" : "롤백 후보";
      const approvedPack = String(pack.status || "").toUpperCase() === "APPROVED";
      renderSelection(
        "팩 " + readText(pack.id),
        "Studio에서 다음 surface를 고르기 위한 Character Pack object 요약입니다. 깊은 비교와 수동 리뷰는 허브 밖에서 계속 진행합니다.",
        [
          { label: "채널", value: readText(pack.channelId) },
          { label: "버전", value: "v" + readText(pack.version) },
          { label: "상태", value: readText(pack.status) },
          { label: "마스코트 프로필", value: summary.mascotProfile },
          { label: "선택된 뷰", value: summary.selectedViews },
          { label: "계보", value: summary.lineage },
          { label: "최신 에피소드", value: latestEpisode ? readText(latestEpisode.id) + " / " + readText(latestEpisode.topic) : "-" },
          { label: "롤백 상태", value: rollbackState }
        ],
        [
          title: approvedPack ? "Characters에서 깊은 팩 리뷰 후 필요하면 rollback" : "Character Generator에서 compare / approve 닫기",
          detail: approvedPack
            ? "이 팩은 이미 승인 상태입니다. preview/QC/lineage/jobs는 Characters에서 읽고, 교체나 rollback 판단만 Generator로 넘기세요."
            : "아직 승인 전 팩이므로 compare, pick, regenerate/recreate, approve는 Character Generator에서 마무리하세요."
        },
        [
          { label: "팩 리뷰", href: buildCharactersHref(packId) },
          { label: "생성 허브", href: buildGeneratorHref({ currentObject: "pack:" + packId }) },
          latestEpisode ? { label: "최신 에피소드", href: "/ui/episodes/" + encodeURIComponent(readText(latestEpisode.id)) } : null,
          summary.mascotProfile && summary.mascotProfile !== "(기록 없음)" ? { label: "프로필", href: "/ui/profiles?q=" + encodeURIComponent(summary.mascotProfile) } : null,
          buildCompareSurfaceHref(packId) ? { label: "비교", href: buildCompareSurfaceHref(packId) } : null
        ].filter(Boolean),
        [
          { label: "pack.json", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/pack.json" },
          { label: "QC 리포트", href: "/artifacts/characters/" + encodeURIComponent(packId) + "/qc_report.json" }
        ]
      );
      rememberSelection("pack", packId);
    } catch (error) {
      renderSelection("팩 조회 실패", String(error), [], null, [{ label: "캐릭터 열기", href: "/ui/characters" }], []);
    }
  };
  const loadEpisodeInspector = async (episodeId) => {
    if (!episodeId) return;
    renderSelection("에피소드 불러오는 중...", "API에서 에피소드 메타데이터를 읽는 중입니다...", [], null, [], []);
    try {
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId));
      if (!res.ok) throw new Error("에피소드 상세 조회 실패: " + res.status);
      const json = await res.json();
      const data = json?.data;
      const episode = data?.episode;
      if (!episode) throw new Error("에피소드 상세 응답에 데이터가 없습니다.");
      const style = readPath(episode, ["datasetVersionSnapshot", "style"]) || {};
      const latestJob = Array.isArray(data.jobs) && data.jobs.length > 0 ? data.jobs[0] : null;
      const previewExists = Boolean(data?.artifacts?.previewExists);
      const finalExists = Boolean(data?.artifacts?.finalExists);
      renderSelection(
        "에피소드 " + readText(episode.id),
        "선택한 Episode object의 최신 실행 맥락, 스타일 프로필, 산출물 준비 상태입니다.",
        [
          { label: "채널", value: readText(readPath(episode, ["channel", "name"]) || readPath(episode, ["channelId"])) },
          { label: "주제", value: readText(episode.topic) },
          { label: "상태", value: readText(episode.status) },
          { label: "캐릭터 팩", value: readText(episode.characterPackId, "(없음)") },
          { label: "스타일 프리셋", value: readText(readPath(style, ["stylePresetId"]), "(자동)") },
          { label: "후킹 부스트", value: readText(readPath(style, ["hookBoost"]), "-") },
          { label: "최신 작업", value: latestJob ? readText(latestJob.type) + " / " + readText(latestJob.status) : "(없음)" },
          { label: "산출물", value: "프리뷰=" + (previewExists ? "예" : "아니오") + " / 최종=" + (finalExists ? "예" : "아니오") }
        ],
        [
          title: !previewExists
            ? "프리뷰 렌더를 큐에 등록"
            : !finalExists
              ? "에디터와 퍼블리시 surface로 넘기기"
              : "퍼블리시 또는 후속 검토로 넘기기",
          detail: !previewExists
            ? "프리뷰가 아직 없으므로 dispatch rail 또는 episode detail에서 preview job을 enqueue하세요."
            : !finalExists
              ? "프리뷰는 준비되었습니다. 샷 편집이나 publish handoff를 계속 진행하세요."
              : "핵심 산출물이 준비되었습니다. publish나 linked outputs 검토 surface로 넘기면 됩니다."
        },
        [
          { label: "에피소드 상세", href: "/ui/episodes/" + encodeURIComponent(episodeId) },
          { label: "샷 에디터", href: "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor" },
          { label: "프로필", href: "/ui/profiles" },
          { label: "퍼블리시", href: "/ui/publish?episodeId=" + encodeURIComponent(episodeId) },
          episode.characterPackId ? { label: "팩 리뷰", href: buildCharactersHref(readText(episode.characterPackId)) } : null
        ].filter(Boolean),
        []
      );
      rememberSelection("episode", episodeId);
    } catch (error) {
      renderSelection("에피소드 조회 실패", String(error), [], null, [{ label: "에피소드 열기", href: "/ui/episodes" }], []);
    }
  };

  const loadAssets = async () => {
    if (!(assetsBody instanceof HTMLElement)) return;
    assetsBody.innerHTML = renderStateRow(4, "loading", "에셋 불러오는 중", "최신 에셋 입력 레코드를 가져오는 중입니다.");
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("에셋 목록 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-assets-count", list.length);
      if (!list.length) {
        assetsBody.innerHTML = renderStateRow(4, "empty", "에셋이 아직 없습니다", "레퍼런스, 변형 뷰, 배경, 차트 소스를 업로드해 에셋 파이프라인을 시작하세요.");
        return;
      }
      assetsBody.innerHTML = list
        .map((asset) => {
          const assetId = String(asset.id || "");
          return "<tr data-asset-id=\\"" + safe(assetId) + "\\"><td><a href=\\"" + safe(buildStudioHref({ assetId, currentObject: "asset:" + assetId })) + "\\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>";
        })
        .join("");
      assetsBody.querySelectorAll("tr[data-asset-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const assetId = row.dataset.assetId || "";
          markSelectedRows(assetsBody, "asset", assetId);
          updateSelectionSummary();
          void loadAssetInspector(assetId);
          setStatus("에셋 선택: " + (assetId || "알 수 없는 에셋"));
        });
      });
      markSelectedRows(assetsBody, "asset", selectedAssetId);
      applyFilter(q("studio-filter-assets"), assetsBody);
    } catch (e) {
      setCounter("studio-assets-count", 0);
      assetsBody.innerHTML = renderStateRow(4, "error", "에셋 피드를 사용할 수 없음", String(e));
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    packsBody.innerHTML = renderStateRow(4, "loading", "캐릭터 팩 불러오는 중", "최신 생성 출력을 가져오는 중입니다.");
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("캐릭터 팩 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-packs-count", list.length);
      if (!list.length) {
        packsBody.innerHTML = renderStateRow(4, "empty", "캐릭터 팩이 아직 없습니다", "다음 팩을 스테이징할 준비가 되면 캐릭터 생성기를 여세요.");
        return;
      }
      packsBody.innerHTML = list.map((pack) => {
        const packId = String(pack.id || "");
        const linkedEpisodeId = readText(readPath(pack, ["latestEpisode", "id"]) || pack.episodeId, "-");
        return "<tr data-pack-id=\\"" + safe(packId) + "\\" data-pack-status=\\"" + safe(pack.status) + "\\" data-pack-version=\\"" + safe(pack.version) + "\\" data-pack-episode-id=\\"" + safe(linkedEpisodeId) + "\\"><td><a href=\\"" + safe(buildStudioHref({ packId, currentObject: "pack:" + packId })) + "\\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(linkedEpisodeId) + "</td></tr>";
      }).join("");
      packsBody.querySelectorAll("tr[data-pack-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const packId = row.dataset.packId || "";
          if (selectedPack instanceof HTMLInputElement) selectedPack.value = packId;
          const linkedEpisodeId = String(row.dataset.packEpisodeId || "").trim();
          if (episodeInput instanceof HTMLInputElement && linkedEpisodeId && linkedEpisodeId !== "-") episodeInput.value = linkedEpisodeId;
          markSelectedRows(packsBody, "pack", packId);
          updateSelectionSummary();
          void loadPackInspector(packId);
          setStatus("캐릭터 팩 선택: " + (packId || "알 수 없는 팩"));
        });
      });
      markSelectedRows(packsBody, "pack", selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
      applyFilter(q("studio-filter-packs"), packsBody);
    } catch (e) {
      setCounter("studio-packs-count", 0);
      packsBody.innerHTML = renderStateRow(4, "error", "캐릭터 팩 피드를 사용할 수 없음", String(e));
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    episodesBody.innerHTML = renderStateRow(4, "loading", "에피소드 불러오는 중", "최신 에피소드 큐 상태를 동기화하는 중입니다.");
    try {
      const res = await fetch("/api/episodes?limit=30");
      if (!res.ok) throw new Error("에피소드 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-episodes-count", list.length);
      if (!list.length) {
        episodesBody.innerHTML = renderStateRow(4, "empty", "에피소드가 아직 없습니다", "디스패치 카드에서 에피소드를 생성해 타임라인 흐름을 시작하세요.");
        return;
      }
      episodesBody.innerHTML = list
        .map(
          (episode) =>
            "<tr data-episode-id=\\"" +
            safe(episode.id) +
            "\\" data-episode-topic=\\"" +
            safe(episode.topic || "") +
            "\\"><td><a href=\\"" +
            safe(buildStudioHref({ episodeId: String(episode.id || ""), currentObject: "episode:" + String(episode.id || "") })) +
            "\\">" +
            safe(episode.id) +
            "</a></td><td>" +
            safe(episode.topic || "-") +
            "</td><td>" +
            safe(episode.status) +
            "</td><td>" +
            safe(episode.latestJobType || "-") +
            "</td></tr>"
        )
        .join("");
      episodesBody.querySelectorAll("tr[data-episode-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const episodeId = row.dataset.episodeId || "";
          const episodeTopic = row.dataset.episodeTopic || "";
          if (episodeInput instanceof HTMLInputElement) episodeInput.value = episodeId;
          if (topicInput instanceof HTMLInputElement && episodeTopic) topicInput.value = episodeTopic;
          markSelectedRows(episodesBody, "episode", episodeId);
          updateSelectionSummary();
          void loadEpisodeInspector(episodeId);
          setStatus("에피소드 선택: " + (episodeId || "알 수 없는 에피소드"));
        });
      });
      markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
      applyFilter(q("studio-filter-episodes"), episodesBody);
    } catch (e) {
      setCounter("studio-episodes-count", 0);
      episodesBody.innerHTML = renderStateRow(4, "error", "에피소드 피드를 사용할 수 없음", String(e));
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    jobsBody.innerHTML = renderStateRow(5, "loading", "작업 불러오는 중", "최신 큐 텔레메트리를 기다리는 중입니다.");
    try {
      const res = await fetch("/api/jobs?limit=30");
      if (!res.ok) throw new Error("작업 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setCounter("studio-jobs-count", list.length);
      if (!list.length) {
        jobsBody.innerHTML = renderStateRow(5, "empty", "작업이 아직 없습니다", "프리뷰, 렌더, 퍼블리시 단계를 시작해 작업 레일을 채우세요.");
        return;
      }
      jobsBody.innerHTML = list.map((job) => {
        const progress = Number.isFinite(Number(job.progress)) ? safe(job.progress) + "%" : "-";
        return "<tr><td><a href=\\"/ui/jobs/" + encodeURIComponent(String(job.id || "")) + "\\">" + safe(job.id) + "</a></td><td>" + safe(job.type) + "</td><td>" + safe(job.status) + "</td><td>" + progress + "</td><td>" + safe(job.episodeId || "-") + "</td></tr>";
      }).join("");
      applyFilter(q("studio-filter-jobs"), jobsBody);
    } catch (e) {
      setCounter("studio-jobs-count", 0);
      jobsBody.innerHTML = renderStateRow(5, "error", "작업 피드를 사용할 수 없음", String(e));
    }
  };

  const refreshAll = async () => {
    setStatus("에셋, 캐릭터 팩, 에피소드, 작업을 동기화하는 중...");
    await Promise.allSettled([loadAssets(), loadPacks(), loadEpisodes(), loadJobs()]);
    setStatus("피드 동기화 완료. 활동을 검토하고 다음 워크벤치를 선택하세요.");
  };

  const startAutoRefresh = () => {
    if (refreshTimer) clearInterval(refreshTimer);
    const enabled = autoRefreshInput instanceof HTMLInputElement ? autoRefreshInput.checked : false;
    if (!enabled) return;
    const intervalMs = refreshIntervalInput instanceof HTMLSelectElement ? Number.parseInt(refreshIntervalInput.value, 10) || 5000 : 5000;
    refreshTimer = setInterval(() => { void loadAssets(); void loadPacks(); void loadEpisodes(); void loadJobs(); }, intervalMs);
  };

  q("studio-refresh-all")?.addEventListener("click", () => { void refreshAll(); });
  q("studio-refresh-assets")?.addEventListener("click", () => { void loadAssets(); });
  q("studio-refresh-packs")?.addEventListener("click", () => { void loadPacks(); });
  q("studio-refresh-episodes")?.addEventListener("click", () => { void loadEpisodes(); });
  q("studio-refresh-jobs")?.addEventListener("click", () => { void loadJobs(); });
  q("studio-filter-assets")?.addEventListener("input", () => applyFilter(q("studio-filter-assets"), assetsBody));
  q("studio-filter-packs")?.addEventListener("input", () => applyFilter(q("studio-filter-packs"), packsBody));
  q("studio-filter-episodes")?.addEventListener("input", () => applyFilter(q("studio-filter-episodes"), episodesBody));
  q("studio-filter-jobs")?.addEventListener("input", () => applyFilter(q("studio-filter-jobs"), jobsBody));
  autoRefreshInput?.addEventListener("change", startAutoRefresh);
  refreshIntervalInput?.addEventListener("change", startAutoRefresh);
  selectedPack?.addEventListener("input", () => {
    markSelectedRows(packsBody, "pack", selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "");
    updateSelectionSummary();
    syncStudioUrl();
    renderCreationNav();
  });
  episodeInput?.addEventListener("input", () => {
    markSelectedRows(episodesBody, "episode", episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "");
    updateSelectionSummary();
    syncStudioUrl();
    renderCreationNav();
  });
  topicInput?.addEventListener("input", updateSelectionSummary);

  q("studio-asset-upload-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = q("studio-asset-upload-form");
    const output = q("studio-asset-upload-result");
    const submit = q("studio-asset-upload-submit");
    if (!(form instanceof HTMLFormElement) || !(output instanceof HTMLElement) || !(submit instanceof HTMLButtonElement)) return;
    submit.disabled = true;
    output.textContent = "업로드 중...";
    try {
      const fd = new FormData(form);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      const json = await res.json();
      output.textContent = JSON.stringify(json, null, 2);
      if (res.ok && json?.data?.assetId) {
        setStatus("에셋 업로드 완료. 에셋 상세를 여는 중...");
        window.location.href = buildAssetHref(String(json.data.assetId));
      }
    } catch (error) {
      output.textContent = String(error);
      setStatus("에셋 업로드 실패: " + String(error));
    } finally {
      submit.disabled = false;
    }
  });

  q("studio-create-episode")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "스튜디오 디스패치 에피소드";
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined
        })
      });
      if (!res.ok) throw new Error(await readError(res, "에피소드 생성 실패"));
      const json = await res.json();
      const episodeId = String(json?.data?.episode?.id || "");
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      updateSelectionSummary();
      setStatus("에피소드 생성됨: " + (episodeId || "(id 없음)"));
      if (episodeId) void loadEpisodeInspector(episodeId);
      void loadEpisodes();
    } catch (error) {
      setStatus("에피소드 생성 실패: " + String(error));
    }
  });

  q("studio-oneclick")?.addEventListener("click", async () => {
    try {
      const topic = topicInput instanceof HTMLInputElement && topicInput.value.trim() ? topicInput.value.trim() : "스튜디오 프리뷰 에피소드";
      const createRes = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          characterPackId: selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() || undefined : undefined,
          pipeline: { stopAfterPreview: true, autoRenderFinal: false }
        })
      });
      if (!createRes.ok) throw new Error(await readError(createRes, "에피소드 생성 실패"));
      const createJson = await createRes.json();
      const jobId = String(createJson?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else window.location.href = "/ui/episodes";
    } catch (error) {
      setStatus("원클릭 시작 실패: " + String(error));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    if (!episodeId) return setStatus("먼저 episodeId를 입력하세요.");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId) + "/editor";
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    try {
      const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
      if (!episodeId) throw new Error("먼저 episodeId를 입력하세요.");
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error(await readError(res, "프리뷰 큐 등록 실패"));
      const json = await res.json();
      const jobId = String(json?.data?.job?.id || "");
      if (jobId) window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
      else setStatus("프리뷰 렌더가 큐에 등록되었습니다.");
    } catch (error) {
      setStatus("프리뷰 큐 등록 실패: " + String(error));
    }
  });

  q("studio-open-publish")?.addEventListener("click", () => {
    const episodeId = episodeInput instanceof HTMLInputElement ? episodeInput.value.trim() : "";
    window.location.href = "/ui/publish" + (episodeId ? ("?episodeId=" + encodeURIComponent(episodeId)) : "");
  });

  updateSelectionSummary();
  if (selectedPack instanceof HTMLInputElement && initialPackId) selectedPack.value = initialPackId;
  if (episodeInput instanceof HTMLInputElement && initialEpisodeId) episodeInput.value = initialEpisodeId;
  renderCreationNav();
  if (selectedAssetId) {
    void loadAssetInspector(selectedAssetId);
  } else if (initialPackId) {
    markSelectedRows(packsBody, "pack", initialPackId);
    void loadPackInspector(initialPackId);
  } else if (initialEpisodeId) {
    markSelectedRows(episodesBody, "episode", initialEpisodeId);
    void loadEpisodeInspector(initialEpisodeId);
  } else if (activePackId) {
    if (selectedPack instanceof HTMLInputElement && !selectedPack.value.trim()) selectedPack.value = activePackId;
    markSelectedRows(packsBody, "pack", activePackId);
    void loadPackInspector(activePackId);
  }
  void loadAssets();
  void loadPacks();
  void loadEpisodes();
  void loadJobs();
  startAutoRefresh();
  if (focusTargetId && !window.location.hash) {
    const focusTarget = document.getElementById(focusTargetId);
    if (focusTarget instanceof HTMLElement) {
      setTimeout(() => focusTarget.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    }
  }
})();
</script>`;
}
