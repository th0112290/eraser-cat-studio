import { UI_SHELL_CLIENT } from "./uiShellClient";
import { UI_SHELL_FLAT_NAV, UI_SHELL_NAV_GROUPS, UI_SHELL_SHORTCUTS } from "./uiShellConfig";
import { UI_SHELL_STYLES } from "./uiShellStyles";

function esc(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNav(): string {
  return UI_SHELL_NAV_GROUPS.map((group) => {
    const links = group.items
      .map((item) => {
        const hotkey = item.hotkey ? `<small>${esc(item.hotkey)}</small>` : "";
        return `<a href="${esc(item.href)}" data-shell-link title="${esc(item.description)}"><strong>${esc(
          item.label
        )}</strong>${hotkey}</a>`;
      })
      .join("");

    return `<section class="shell-nav-group"><div class="shell-nav-head"><span>${esc(group.label)}</span><small>${esc(
      group.description
    )}</small></div><div class="shell-nav-links">${links}</div></section>`;
  }).join("");
}

function renderShortcutRows(): string {
  return UI_SHELL_SHORTCUTS.map(
    (item) => `<tr><td><span class="kbd">${esc(item.key)}</span></td><td>${esc(item.action)}</td></tr>`
  ).join("");
}

export function renderUiPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <style>${UI_SHELL_STYLES}</style>
</head>
<body data-page-title="${esc(title)}" data-shell-nav='${esc(JSON.stringify(UI_SHELL_FLAT_NAV))}' data-shell-grammar="phase-2">
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="shell-header top-shell">
    <div class="shell-inner">
      <div class="shell-top">
        <div class="shell-brand shell-brand-block">
          <div class="shell-brand-mark"><strong>EC</strong><span>Eraser Cat Control Plane</span></div>
          <div class="shell-brand-copy">
            <h1>오브젝트 중심 운영 콘솔</h1>
            <p>목록, 상세, 비교, 복구, 산출물 확인을 같은 제품 문법으로 묶습니다. 페이지별 장식보다 상태, 판단, 다음 액션이 먼저 보이도록 유지합니다.</p>
          </div>
        </div>
        <div class="shell-meta shell-meta-panel" aria-label="현재 컨트롤 상태">
          <div class="shell-chip-row shell-context-row">
            <span class="shell-chip shell-chip-static">관찰 / 생성 / 검토 / 시스템</span>
            <span class="shell-chip shell-chip-object" id="shell-current-object">현재 오브젝트 없음</span>
            <span class="shell-chip shell-chip-state" id="shell-current-state" data-severity="muted">정상</span>
          </div>
          <div class="shell-status-row shell-status-lane">
            <span class="shell-status"><strong>상태</strong><span>오브젝트 상태를 먼저 읽습니다.</span></span>
            <span class="shell-status"><strong>비교</strong><span>비교와 판정 경로를 위쪽에 고정합니다.</span></span>
            <span class="shell-status"><strong>복구</strong><span>실패 이후 경로를 계속 노출합니다.</span></span>
            <span class="shell-status"><strong>시계</strong><span id="shell-live-clock">--:--:--</span></span>
          </div>
          <div class="shell-shortcuts">
            <span class="muted-text shell-shortcut-copy">단축키: <span class="kbd">?</span> 도움말, <span class="kbd">/</span> 필터, <span class="kbd">r</span> 기본 액션</span>
            <button id="shell-nav-toggle" type="button" class="secondary shell-nav-toggle" aria-expanded="false" aria-controls="shell-primary-nav">메뉴</button>
            <button id="shortcut-open" type="button" class="secondary" aria-haspopup="dialog" aria-expanded="false" aria-controls="shortcut-help">단축키</button>
          </div>
        </div>
      </div>
      <nav id="shell-primary-nav" aria-label="주요 탐색"><div class="shell-nav-grid">${renderNav()}</div></nav>
    </div>
  </header>
  <main id="main-content">
    <section class="page-intro page-header object-header-shell shell-surface shell-surface-hero" data-surface-role="object-header" aria-label="페이지 소개">
      <div class="hero-grid page-header-grid">
        <div class="page-intro-head page-header-main">
          <div class="stack page-title-stack">
            <span class="muted-text shell-page-kicker header-kicker" id="shell-page-group">관찰</span>
            <div class="object-header object-header-identity">
              <div class="object-header-main object-header-copy-block">
                <h2 id="shell-page-title" class="page-title">${esc(title)}</h2>
                <p class="section-intro shell-page-copy object-header-copy" id="shell-page-summary">오브젝트 중심 제어면에서 빠른 라우팅, 상세 작업, 비교 검토, 복구 대응을 진행합니다.</p>
              </div>
              <div class="quick-links object-header-meta object-header-meta-grid">
                <span class="shell-chip shell-chip-path"><strong>경로</strong><span id="shell-page-path">/ui</span></span>
                <span class="shell-chip shell-chip-object"><strong>오브젝트</strong><span id="shell-page-object">현재 오브젝트 없음</span></span>
              </div>
            </div>
          </div>
        </div>
        <div class="status-panel metadata-block preflight-box page-status-panel" data-surface-role="metadata" data-surface-kicker="현재 상태" aria-label="페이지 상태">
          <div class="status-row metadata-row"><span class="label">필터 상태</span><strong id="shell-filter-state">URL 상태 대기</strong></div>
          <div class="status-row metadata-row"><span class="label">알림 상태</span><strong id="shell-alert-state">정상</strong></div>
          <div class="status-row metadata-row"><span class="label">복구 경로</span><strong id="shell-recovery-state">작업 / 상태 / 비교</strong></div>
        </div>
      </div>
    </section>
    <section class="sticky-action-bar shell-action-bar action-rail-shell" data-surface-role="action" aria-label="고정 액션 바">
      <div class="shell-action-head">
        <div class="stack shell-action-summary">
          <span class="muted-text">주요 액션</span>
          <div class="quick-links shell-action-state">
            <span class="shell-chip shell-chip-filter" id="shell-filter-chip" data-severity="muted">URL 상태 대기</span>
            <span class="shell-chip shell-chip-state" id="shell-alert-chip" data-severity="muted">정상</span>
          </div>
        </div>
        <span class="muted-text shell-action-copy">기본 액션, 필터, 링크 복사를 같은 위치에 둡니다.</span>
      </div>
      <div class="shell-action-buttons">
        <button id="shell-primary-action" type="button"><span class="kbd">R</span><span id="shell-primary-label">기본 액션 실행</span></button>
        <button id="shell-filter-action" type="button" class="secondary"><span class="kbd">/</span><span>필터 포커스</span></button>
        <button id="shell-copy-link" type="button" class="secondary">링크 복사</button>
      </div>
    </section>
    ${body}
  </main>
  <div id="global-live" class="sr-live" aria-live="polite" aria-atomic="true"></div>
  <div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div>
  <div id="shortcut-help" class="shortcut-help" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shortcut-title">
    <div class="shortcut-card">
      <h2 id="shortcut-title">단축키 도움말</h2>
      <table><thead><tr><th>키</th><th>동작</th></tr></thead><tbody>${renderShortcutRows()}</tbody></table>
      <div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">닫기</button></div>
    </div>
  </div>
  <script>${UI_SHELL_CLIENT}</script>
</body>
</html>`;
}
