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
<body data-page-title="${esc(title)}" data-shell-nav='${esc(JSON.stringify(UI_SHELL_FLAT_NAV))}'>
  <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
  <header class="shell-header">
    <div class="shell-inner">
      <div class="shell-top">
        <div class="shell-brand">
          <div class="shell-brand-mark"><strong>EC</strong><span>Eraser Cat 컨트롤 플레인</span></div>
          <h1>오브젝트 중심 운영 콘솔</h1>
          <p>대시보드, 목록, 상세, 워크벤치, 비교 화면을 하나의 공통 셸로 묶었습니다. 목록은 진입점이고, 실제 결정은 상세, 비교, 복구 패널에서 이뤄집니다.</p>
        </div>
        <div class="shell-meta">
          <div class="shell-chip-row">
            <span class="shell-chip">관찰 / 생성 / 검토 / 시스템</span>
            <span class="shell-chip" id="shell-current-object">현재 오브젝트 없음</span>
            <span class="shell-chip" id="shell-current-state">정상</span>
          </div>
          <div class="shell-status-row">
            <span class="shell-status"><strong>상태</strong><span>상태 우선 라우팅</span></span>
            <span class="shell-status"><strong>비교</strong><span>비교 검토를 기본 경로로 유지</span></span>
            <span class="shell-status"><strong>복구</strong><span>복구 경로를 항상 노출</span></span>
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
    <section class="page-intro" aria-label="페이지 소개">
      <div class="hero-grid">
        <div class="page-intro-head">
          <div class="stack">
            <span class="muted-text shell-page-kicker" id="shell-page-group">관찰</span>
            <h2 id="shell-page-title">${esc(title)}</h2>
            <p class="section-intro shell-page-copy" id="shell-page-summary">오브젝트 중심 제어면에서 빠른 라우팅, 상세 작업, 비교 검토, 복구 대응을 진행합니다.</p>
          </div>
          <div class="quick-links">
            <span class="shell-chip"><strong>경로</strong><span id="shell-page-path">/ui</span></span>
            <span class="shell-chip"><strong>오브젝트</strong><span id="shell-page-object">현재 오브젝트 없음</span></span>
          </div>
        </div>
        <div class="status-panel" aria-label="페이지 상태">
          <div class="status-row"><span class="label">필터 상태</span><strong id="shell-filter-state">URL 상태 대기</strong></div>
          <div class="status-row"><span class="label">알림 상태</span><strong id="shell-alert-state">정상</strong></div>
          <div class="status-row"><span class="label">복구</span><strong id="shell-recovery-state">작업 / 상태 / 비교</strong></div>
        </div>
      </div>
    </section>
    <section class="sticky-action-bar" aria-label="고정 액션 바">
      <span class="muted-text">액션 계층</span>
      <button id="shell-primary-action" type="button"><span class="kbd">R</span><span id="shell-primary-label">기본 액션 실행</span></button>
      <button id="shell-filter-action" type="button" class="secondary"><span class="kbd">/</span><span>필터 포커스</span></button>
      <button id="shell-copy-link" type="button" class="secondary">링크 복사</button>
      <div class="quick-links">
        <span class="shell-chip" id="shell-filter-chip">URL 상태 대기</span>
        <span class="shell-chip" id="shell-alert-chip">정상</span>
      </div>
    </section>
    ${body}
  </main>
  <div id="global-live" class="sr-live" aria-live="polite" aria-atomic="true"></div>
  <div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div>
  <div id="shortcut-help" class="shortcut-help" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="shortcut-title">
    <div class="shortcut-card">
      <h2 id="shortcut-title">키보드 단축키</h2>
      <table><thead><tr><th>키</th><th>동작</th></tr></thead><tbody>${renderShortcutRows()}</tbody></table>
      <div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">닫기</button></div>
    </div>
  </div>
  <script>${UI_SHELL_CLIENT}</script>
</body>
</html>`;
}
